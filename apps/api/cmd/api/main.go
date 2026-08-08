package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/analytics"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/audit"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/bookings"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/campaigns"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/checkin"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/content"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/crm"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/crmworkflow"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/enquiries"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/events"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/exports"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/httpapi"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/issuance"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/media"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/merch"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/newsletter"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/config"
	mongoplatform "github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/observability"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/privacy"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/search"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/services"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/settings"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/support"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/ticketanalytics"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/ticketing"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/ticketops"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func main() {
	logger := slog.New(observability.NewJSONHandler(os.Stdout, nil))
	if err := sentry.Init(sentry.ClientOptions{
		Dsn:              os.Getenv("SENTRY_DSN"),
		Environment:      envOrDefault("APP_ENV", "development"),
		Release:          os.Getenv("RELEASE_VERSION"),
		SendDefaultPII:   false,
		AttachStacktrace: true,
	}); err != nil {
		logger.Error("sentry initialization failed", "error", err)
	}
	defer sentry.Flush(2 * time.Second)
	if err := config.ValidateStartup(os.Getenv); err != nil {
		logger.Error("environment validation failed", "error", err)
		os.Exit(1)
	}
	appEnvironment := envOrDefault("APP_ENV", "development")
	mongoClient, err := mongoplatform.Connect(context.Background(), mongoplatform.Config{URI: os.Getenv("MONGODB_URI"), Database: os.Getenv("MONGODB_DATABASE"), Environment: appEnvironment})
	if err != nil {
		logger.Error("database initialization failed", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := mongoClient.Close(context.Background()); err != nil {
			logger.Error("database shutdown failed", "error", err)
		}
	}()
	secretBox, err := auth.NewSecretBox(os.Getenv("MFA_ENCRYPTION_KEY"))
	if err != nil {
		logger.Error("authentication initialization failed", "error", err)
		os.Exit(1)
	}
	// Where the console lives, and which origin proxies its API calls. Differs
	// between the console-under-/admin and standalone-subdomain topologies.
	adminConsoleURL, adminOriginURL := adminURLs()
	authStore := auth.NewMongoStore(mongoClient.Database(), secretBox)
	authService := auth.NewService(authStore, nil, 12*time.Hour)
	secureCookies := appEnvironment != "local" && appEnvironment != "development" && appEnvironment != "test"
	// Optional: without it, invitations are still issued and the administrator
	// passes the returned link on by hand rather than onboarding being blocked.
	var invitationMailer auth.InvitationMailer
	if resendKey := os.Getenv("RESEND_API_KEY"); resendKey != "" {
		mailer, mailerErr := auth.NewResendInvitationMailer(&http.Client{Timeout: 10 * time.Second}, envOrDefault("RESEND_API_URL", "https://api.resend.com/emails"), resendKey, os.Getenv("RESEND_FROM_EMAIL"))
		if mailerErr != nil {
			logger.Warn("staff invitation email disabled", "error", mailerErr)
		} else {
			invitationMailer = mailer
		}
	}
	authHandler, err := auth.NewHTTPHandler(authService, auth.HTTPConfig{SecureCookies: secureCookies, Production: appEnvironment == "production", AllowedOrigin: adminOriginURL, TrustedProxyCIDRs: splitNonempty(os.Getenv("AUTH_TRUSTED_PROXY_CIDRS")), PublicWebURL: adminConsoleURL, InvitationMailer: invitationMailer})
	if err != nil {
		logger.Error("authentication HTTP configuration failed", "error", err)
		os.Exit(1)
	}
	settingsHandler := settings.NewHTTPHandler(settings.NewService(settings.NewMongoStore(mongoClient.Database()), nil), authHandler)
	mediaConfig, err := media.LoadRuntimeConfig(appEnvironment, os.Getenv)
	if err != nil {
		logger.Error("media configuration failed", "error", err)
		os.Exit(1)
	}
	var mediaProvider media.Provider = media.UnavailableProvider{}
	if mediaConfig.Configured {
		mediaProvider, err = media.NewCloudinary(mediaConfig.Cloudinary, nil, nil)
		if err != nil {
			logger.Error("media provider initialization failed", "error", err)
			os.Exit(1)
		}
	}
	mediaService, err := media.NewService(mustMediaRepository(mongoClient.Database()), mediaProvider, mediaConfig.Policy, nil)
	if err != nil {
		logger.Error("media service initialization failed", "error", err)
		os.Exit(1)
	}
	mediaHandler, err := media.NewHTTPHandler(mediaService, func(request *http.Request) (media.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return media.Actor{}, auth.ErrUnauthorized
		}
		return media.Actor{ID: principal.InternalUserID, CanEditContent: principal.Role.Allows(auth.PermissionContentEdit)}, nil
	})
	if err != nil {
		logger.Error("media HTTP initialization failed", "error", err)
		os.Exit(1)
	}
	servicesDomain := services.NewDomain(services.NewMongoStore(mongoClient.Database()), nil, nil)
	servicesHandler := services.NewHTTPHandler(servicesDomain, func(request *http.Request) (services.Actor, bool) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return services.Actor{}, false
		}
		return services.Actor{InternalID: principal.InternalUserID, PublicID: principal.UserID, CanEdit: principal.Role.Allows(auth.PermissionContentEdit)}, true
	}, nil)
	contentDomain := content.NewDomain(content.NewMongoRepository(mongoClient.Database()), nil, nil)
	contentHandler := content.NewHTTPHandler(contentDomain, func(request *http.Request) (content.Actor, bool) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return content.Actor{}, false
		}
		return content.Actor{InternalID: principal.InternalUserID, PublicID: principal.UserID, CanEdit: principal.Role.Allows(auth.PermissionContentEdit), CanApprove: principal.Role == auth.RoleAdministrator}, true
	})
	eventsStore := events.NewMongoStore(mongoClient.Database())
	eventsHandler := events.NewHandler(events.NewService(eventsStore, nil, nil), func(request *http.Request) (events.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return events.Actor{}, auth.ErrUnauthorized
		}
		return events.Actor{InternalID: principal.InternalUserID, CanManage: principal.Role.Allows(auth.PermissionBookingsManage)}, nil
	})
	publicEventsHandler := events.NewPublicHandler(events.NewPublicService(eventsStore))
	enquiryIPKey := []byte(os.Getenv("ENQUIRY_IP_HMAC_KEY"))
	if len(enquiryIPKey) < 32 {
		logger.Error("enquiry configuration failed", "error", "ENQUIRY_IP_HMAC_KEY must contain at least 32 bytes")
		os.Exit(1)
	}
	trustedEnquiryProxies, err := enquiries.TrustedProxyPredicate(splitNonempty(os.Getenv("ENQUIRY_TRUSTED_PROXY_CIDRS")))
	if err != nil {
		logger.Error("enquiry proxy configuration failed", "error", err)
		os.Exit(1)
	}
	rateLimit, err := strconv.Atoi(envOrDefault("ENQUIRY_RATE_LIMIT", "5"))
	if err != nil || rateLimit < 1 {
		logger.Error("enquiry rate configuration failed")
		os.Exit(1)
	}
	rateWindow, err := time.ParseDuration(envOrDefault("ENQUIRY_RATE_WINDOW", "1m"))
	if err != nil || rateWindow <= 0 {
		logger.Error("enquiry rate configuration failed")
		os.Exit(1)
	}
	maxRateEntries, err := strconv.Atoi(envOrDefault("ENQUIRY_RATE_MAX_ENTRIES", "10000"))
	if err != nil || maxRateEntries < 1 {
		logger.Error("enquiry rate configuration failed")
		os.Exit(1)
	}
	var captcha enquiries.Captcha
	captchaProvider, captchaSiteKey := os.Getenv("BOT_CHALLENGE_PROVIDER"), os.Getenv("BOT_CHALLENGE_SITE_KEY")
	captchaEnabled := captchaProvider != "" || captchaSiteKey != "" || os.Getenv("BOT_CHALLENGE_VERIFY_URL") != "" || os.Getenv("BOT_CHALLENGE_SECRET_KEY") != ""
	if captchaEnabled {
		if (captchaProvider != "turnstile" && captchaProvider != "recaptcha") || captchaSiteKey == "" {
			logger.Error("enquiry CAPTCHA public configuration failed")
			os.Exit(1)
		}
		captcha, err = enquiries.NewRemoteCaptcha(os.Getenv("BOT_CHALLENGE_VERIFY_URL"), os.Getenv("BOT_CHALLENGE_SECRET_KEY"), &http.Client{Timeout: 5 * time.Second})
		if err != nil {
			logger.Error("enquiry CAPTCHA configuration failed", "error", err)
			os.Exit(1)
		}
	}
	enquiryStore := enquiries.NewMongoStore(mongoClient.Database())
	enquiryDomain := enquiries.NewDomain(enquiryStore, services.NewMongoStore(mongoClient.Database()), captcha, enquiries.NewWindowLimiter(rateLimit, rateWindow, maxRateEntries), enquiries.ConfiguredRiskAssessor{CaptchaEnabled: captchaEnabled}, nil, enquiryIPKey)
	enquiryHandler := enquiries.NewHTTPHandler(enquiryDomain, trustedEnquiryProxies)
	// Without a sender the outbox rows pile up unsent, so the fallback fails
	// loudly per message rather than pretending the mail went out.
	var enquirySender enquiries.Sender = enquiries.UnavailableSender{}
	if resendKey := os.Getenv("RESEND_API_KEY"); resendKey != "" {
		enquirySender, err = enquiries.NewResendSender(mongoClient.Database(), &http.Client{Timeout: 10 * time.Second}, envOrDefault("RESEND_API_URL", "https://api.resend.com/emails"), resendKey, os.Getenv("RESEND_FROM_EMAIL"), envOrDefault("ENQUIRY_INTERNAL_INBOX", os.Getenv("RESEND_FROM_EMAIL")), adminConsoleURL)
		if err != nil {
			logger.Error("enquiry notification configuration failed", "error", err)
			os.Exit(1)
		}
	}
	enquiryWorker := enquiries.NewWorker(enquiryStore, enquirySender)
	ticketHoldDuration, err := time.ParseDuration(envOrDefault("TICKET_HOLD_DURATION", "10m"))
	if err != nil {
		logger.Error("ticket hold configuration failed", "error", err)
		os.Exit(1)
	}
	ticketOrderService, err := ticketing.NewService(ticketing.NewMongoStore(mongoClient.Database()), ticketHoldDuration, nil)
	if err != nil {
		logger.Error("ticket order configuration failed", "error", err)
		os.Exit(1)
	}
	ticketOrderHandler := ticketing.NewHTTPHandler(ticketOrderService)
	ticketTokenKey := []byte(os.Getenv("TICKET_TOKEN_HMAC_KEY"))
	ticketIssuer, err := issuance.NewMongoIssuer(mongoClient.Database(), ticketTokenKey)
	if err != nil {
		logger.Error("ticket issuance configuration failed", "error", "TICKET_TOKEN_HMAC_KEY must contain at least 32 bytes")
		os.Exit(1)
	}
	// Paystack takes over whenever a secret key is present; without one the
	// service stays on UnavailableProvider and checkout returns 503 rather than
	// silently accepting money it cannot capture.
	var paymentProvider payments.PaymentProvider = payments.UnavailableProvider{}
	if paystackKey := strings.TrimSpace(os.Getenv("PAYSTACK_SECRET_KEY")); paystackKey != "" {
		paystack, paystackErr := payments.NewPaystackProvider(paystackKey, os.Getenv("PAYSTACK_API_BASE_URL"), &http.Client{Timeout: 15 * time.Second})
		if paystackErr != nil {
			logger.Error("paystack configuration failed", "error", paystackErr)
			os.Exit(1)
		}
		paymentProvider = paystack
		logger.Info("payment provider configured", "provider", paystack.Name())
	} else {
		logger.Warn("payment provider not configured", "detail", "set PAYSTACK_SECRET_KEY to enable checkout")
	}
	paymentReturnURL := envOrDefault("PAYMENT_RETURN_URL", "https://unconfigured.invalid")
	paymentStore := payments.NewMongoStore(mongoClient.Database())
	paymentStore.SetIssuer(ticketIssuer)
	paymentService, err := payments.NewService(paymentStore, paymentProvider, paymentReturnURL, nil)
	if err != nil {
		logger.Error("payment configuration failed", "error", err)
		os.Exit(1)
	}
	paymentHandler := payments.NewHandler(paymentService)
	ticketHandler := issuance.NewHandler(ticketIssuer)
	ticketAdminHandler := issuance.NewAdminHandler(mongoClient.Database(), authStore)
	var ticketSender issuance.Sender = issuance.UnavailableSender{}
	if resendKey := os.Getenv("RESEND_API_KEY"); resendKey != "" {
		ticketSender, err = issuance.NewResendSender(&http.Client{Timeout: 10 * time.Second}, envOrDefault("RESEND_API_URL", "https://api.resend.com/emails"), resendKey, os.Getenv("RESEND_FROM_EMAIL"))
		if err != nil {
			logger.Error("ticket email configuration failed", "error", err)
			os.Exit(1)
		}
	}
	ticketDeliveryWorker, err := issuance.NewDeliveryWorker(mongoClient.Database(), ticketIssuer, ticketSender, os.Getenv("PUBLIC_WEB_URL"))
	if err != nil {
		logger.Error("ticket delivery configuration failed", "error", err)
		os.Exit(1)
	}
	crmStore := crm.NewMongoStore(mongoClient.Database())
	crmService := crm.NewService(crmStore, nil, nil)
	privacyStore := privacy.NewMongoStore(mongoClient.Database())
	crmService.SetRetentionGuard(privacy.NewContactGuard(privacyStore))
	// Bridges the public `enquiries` collection to the `crm_enquiries` records
	// the console reads. Without it a submission is stored but never surfaces.
	crmIntakeWorker := crm.NewIntakeWorker(crm.NewMongoPendingEnquiries(mongoClient.Database()), crmStore, crmService)
	crmHandler := crm.NewHandler(crmService, func(request *http.Request) (crm.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return crm.Actor{}, auth.ErrUnauthorized
		}
		permissions := map[crm.Permission]bool{}
		if principal.Role.Allows(auth.PermissionEnquiriesManage) {
			permissions[crm.PermissionRead] = true
			permissions[crm.PermissionWrite] = true
			permissions[crm.PermissionAssign] = true
			permissions[crm.PermissionPrivacyExport] = true
		}
		if principal.Role == auth.RoleAdministrator {
			permissions[crm.PermissionPrivacyDelete] = true
		}
		return crm.Actor{InternalID: principal.InternalUserID, Permissions: permissions}, nil
	})
	workflowActor := func(request *http.Request) (crmworkflow.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return crmworkflow.Actor{}, auth.ErrUnauthorized
		}
		permissions := map[crmworkflow.Permission]bool{}
		if principal.Role.Allows(auth.PermissionEnquiriesManage) {
			permissions[crmworkflow.PermissionRead], permissions[crmworkflow.PermissionWrite] = true, true
		}
		if principal.Role == auth.RoleAdministrator {
			permissions[crmworkflow.PermissionRetry] = true
		}
		return crmworkflow.Actor{InternalID: principal.InternalUserID, Permissions: permissions}, nil
	}
	workflowSigner, err := crmworkflow.NewAssetSigner(mongoClient.Database(), []byte(os.Getenv("CRM_ATTACHMENT_HMAC_KEY")), adminOriginURL, nil)
	if err != nil {
		logger.Error("CRM attachment configuration failed", "error", "CRM_ATTACHMENT_HMAC_KEY must contain at least 32 bytes and PUBLIC_WEB_URL must be HTTPS")
		os.Exit(1)
	}
	workflowService := crmworkflow.New(crmworkflow.NewMongoStore(mongoClient.Database()), workflowSigner, crmworkflow.SlogTelemetry{Logger: logger}, nil, crm.UUID)
	workflowHandler := crmworkflow.NewHandler(workflowService, workflowActor)
	workflowDownload := crmworkflow.NewDownloadHandler(workflowSigner, workflowActor)
	var workflowSender crmworkflow.Sender = crmworkflow.UnavailableSender{}
	if resendKey := os.Getenv("RESEND_API_KEY"); resendKey != "" {
		workflowSender, err = crmworkflow.NewResendSender(mongoClient.Database(), &http.Client{Timeout: 10 * time.Second}, envOrDefault("RESEND_API_URL", "https://api.resend.com/emails"), resendKey, os.Getenv("RESEND_FROM_EMAIL"), adminConsoleURL)
		if err != nil {
			logger.Error("CRM notification configuration failed", "error", err)
			os.Exit(1)
		}
	}
	workflowWorker := crmworkflow.NewReminderWorker(mongoClient.Database(), workflowSender, nil, crm.UUID)
	crmProtectedRead := authHandler.Protect(auth.PermissionEnquiriesManage, false, crmHandler)
	crmProtectedWrite := authHandler.Protect(auth.PermissionEnquiriesManage, true, crmHandler)
	workflowProtectedRead := authHandler.Protect(auth.PermissionEnquiriesManage, false, workflowHandler)
	workflowProtectedWrite := authHandler.Protect(auth.PermissionEnquiriesManage, true, workflowHandler)
	workflowDownloadRead := authHandler.Protect(auth.PermissionEnquiriesManage, false, workflowDownload)
	workflowRoutes := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			workflowProtectedRead.ServeHTTP(response, request)
		} else {
			workflowProtectedWrite.ServeHTTP(response, request)
		}
	})
	crmRoutes := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			crmProtectedRead.ServeHTTP(response, request)
			return
		}
		crmProtectedWrite.ServeHTTP(response, request)
	})
	bookingHandler := bookings.NewHandler(bookings.NewService(bookings.NewMongoStore(mongoClient.Database()), nil), func(request *http.Request) (bookings.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return bookings.Actor{}, auth.ErrUnauthorized
		}
		permissions := map[bookings.Permission]bool{}
		if principal.Role.Allows(auth.PermissionBookingsManage) {
			permissions[bookings.Read], permissions[bookings.Write] = true, true
		}
		return bookings.Actor{InternalID: principal.InternalUserID, Permissions: permissions}, nil
	})
	bookingRead := authHandler.Protect(auth.PermissionBookingsManage, false, bookingHandler.Routes())
	bookingWrite := authHandler.Protect(auth.PermissionBookingsManage, true, bookingHandler.Routes())
	bookingRoutes := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			bookingRead.ServeHTTP(response, request)
			return
		}
		bookingWrite.ServeHTTP(response, request)
	})
	campaignStore := campaigns.NewMongoStore(mongoClient.Database())
	campaignHandler := campaigns.NewHandler(campaigns.NewService(campaignStore, campaignStore, nil), func(request *http.Request) (campaigns.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return campaigns.Actor{}, auth.ErrUnauthorized
		}
		return campaigns.Actor{ID: principal.InternalUserID, Role: string(principal.Role)}, nil
	})
	campaignRead := authHandler.Protect(auth.PermissionAdminAccess, false, campaignHandler)
	campaignWrite := authHandler.Protect(auth.PermissionAdminAccess, true, campaignHandler)
	campaignRoutes := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			campaignRead.ServeHTTP(response, request)
			return
		}
		campaignWrite.ServeHTTP(response, request)
	})
	newsletterHandler := newsletter.NewHandler(newsletter.NewStore(mongoClient.Database()))
	newsletterAdmin := authHandler.Protect(auth.PermissionAdminAccess, false, newsletterHandler.AdminRoutes())
	newsletterAdminWrite := authHandler.Protect(auth.PermissionAdminAccess, true, newsletterHandler.AdminRoutes())
	newsletterAdminRoutes := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			newsletterAdmin.ServeHTTP(response, request)
			return
		}
		newsletterAdminWrite.ServeHTTP(response, request)
	})
	// Donations reuse the configured payment provider but keep their own store
	// and reference space so they can never touch ticket inventory.
	supportStore := support.NewMongoStore(mongoClient.Database())
	supportService, supportErr := support.NewService(supportStore, paymentProvider, envOrDefault("PUBLIC_WEB_URL", paymentReturnURL), envOrDefault("SUPPORT_CURRENCY", "GHS"))
	if supportErr != nil {
		logger.Error("donation configuration failed", "error", supportErr)
		os.Exit(1)
	}
	paymentService.SetDonationApplier(supportService, support.IsDonationReference)

	// Merchandise shares the provider and the single webhook endpoint; it is
	// routed by its own JKM- reference prefix.
	merchStore := merch.NewMongoStore(mongoClient.Database())
	merchService, merchErr := merch.NewService(merchStore, paymentProvider, envOrDefault("PUBLIC_WEB_URL", paymentReturnURL), envOrDefault("SUPPORT_CURRENCY", "GHS"))
	if merchErr != nil {
		logger.Error("merchandise configuration failed", "error", merchErr)
		os.Exit(1)
	}
	paymentService.RegisterApplier(merch.IsMerchReference, merchService)
	merchHandler := merch.NewHandler(merchService)
	merchAdminRead := authHandler.Protect(auth.PermissionContentEdit, false, merchHandler.AdminRoutes())
	merchAdminWrite := authHandler.Protect(auth.PermissionContentEdit, true, merchHandler.AdminRoutes())
	merchAdminRoutes := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			merchAdminRead.ServeHTTP(response, request)
			return
		}
		merchAdminWrite.ServeHTTP(response, request)
	})
	supportHandler := support.NewHandler(supportService)
	supportAdminRoutes := authHandler.Protect(auth.PermissionAdminAccess, false, supportHandler.AdminRoutes())

	ticketOpsService := ticketops.NewService(ticketops.NewMongoStore(mongoClient.Database(), crm.UUID), paymentProvider, nil)
	ticketOpsHandler := ticketops.NewHandler(ticketOpsService)
	ticketOpsRead := authHandler.Protect(auth.PermissionBookingsManage, false, ticketOpsHandler)
	ticketOpsWrite := authHandler.Protect(auth.PermissionBookingsManage, true, ticketOpsHandler)
	ticketOpsProtected := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			ticketOpsRead.ServeHTTP(response, request)
			return
		}
		ticketOpsWrite.ServeHTTP(response, request)
	})
	searchHandler := search.NewHandler(search.NewService(search.NewMongoStore(mongoClient.Database())), func(request *http.Request) (search.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return search.Actor{}, auth.ErrUnauthorized
		}
		return search.Actor{UserID: principal.UserID, Role: principal.Role}, nil
	})
	var ticketCommSender ticketops.CommunicationSender = ticketops.UnavailableCommunicationSender{}
	if resendKey := os.Getenv("RESEND_API_KEY"); resendKey != "" {
		ticketCommSender, err = ticketops.NewResendCommunicationSender(&http.Client{Timeout: 10 * time.Second}, envOrDefault("RESEND_API_URL", "https://api.resend.com/emails"), resendKey, os.Getenv("RESEND_FROM_EMAIL"))
		if err != nil {
			logger.Error("ticket operations email configuration failed", "error", err)
			os.Exit(1)
		}
	}
	ticketCommWorker, err := ticketops.NewCommunicationWorker(mongoClient.Database(), ticketCommSender)
	if err != nil {
		logger.Error("ticket communication worker configuration failed", "error", err)
		os.Exit(1)
	}
	checkinHandler := checkin.NewHandler(checkin.NewService(checkin.NewMongoStore(mongoClient.Database(), crm.UUID)), func(request *http.Request) (checkin.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return checkin.Actor{}, auth.ErrUnauthorized
		}
		if principal.Role != auth.RoleAdministrator && principal.Role != auth.RoleBookingManager {
			return checkin.Actor{}, auth.ErrForbidden
		}
		return checkin.Actor{UserID: principal.UserID, InternalID: principal.InternalUserID, Role: string(principal.Role)}, nil
	})
	checkinRead := authHandler.Protect(auth.PermissionBookingsManage, false, checkinHandler)
	checkinWrite := authHandler.Protect(auth.PermissionBookingsManage, true, checkinHandler)
	checkinRoutes := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			checkinRead.ServeHTTP(response, request)
			return
		}
		checkinWrite.ServeHTTP(response, request)
	})
	ticketAnalyticsHandler := ticketanalytics.NewHandler(ticketanalytics.NewService(ticketanalytics.NewMongoStore(mongoClient.Database())), func(request *http.Request) (ticketanalytics.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return ticketanalytics.Actor{}, auth.ErrUnauthorized
		}
		return ticketanalytics.Actor{UserID: principal.UserID, Role: principal.Role}, nil
	})
	exportHandler := exports.NewHandler(exports.NewService(exports.NewMongoStore(mongoClient.Database(), crm.UUID)), func(request *http.Request) (exports.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return exports.Actor{}, auth.ErrUnauthorized
		}
		return exports.Actor{UserID: principal.UserID, InternalID: principal.InternalUserID, Role: principal.Role}, nil
	})
	auditHandler := audit.NewHandler(audit.NewService(audit.NewMongoStore(mongoClient.Database())), func(request *http.Request) (audit.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return audit.Actor{}, auth.ErrUnauthorized
		}
		return audit.Actor{UserID: principal.UserID, Role: principal.Role}, nil
	})
	var analyticsSink analytics.Sink = analytics.NoopSink{}
	if key := strings.TrimSpace(os.Getenv("POSTHOG_API_KEY")); key != "" {
		analyticsSink = analytics.NewPostHogSink(os.Getenv("POSTHOG_HOST"), key)
	}
	analyticsHandler := analytics.NewHandler(analytics.NewService(analytics.NewMongoStore(mongoClient.Database()), analyticsSink, crm.UUID), func(request *http.Request) (analytics.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return analytics.Actor{}, auth.ErrUnauthorized
		}
		return analytics.Actor{UserID: principal.UserID, Role: principal.Role}, nil
	})
	privacyService := privacy.NewService(privacyStore, nil, nil)
	privacyHandler := privacy.NewHandler(privacyService, func(request *http.Request) (privacy.Actor, error) {
		principal, ok := auth.PrincipalFromContext(request.Context())
		if !ok {
			return privacy.Actor{}, auth.ErrUnauthorized
		}
		return privacy.Actor{UserID: principal.UserID, InternalID: principal.InternalUserID, Role: principal.Role}, nil
	})
	privacyWorker := privacy.NewRetentionWorker(privacyService, privacy.Actor{UserID: "system", InternalID: "000000000000000000000000", Role: auth.RoleAdministrator})
	privacyRead := authHandler.Protect(auth.PermissionUsersManage, false, privacyHandler)
	privacyWrite := authHandler.Protect(auth.PermissionUsersManage, true, privacyHandler)
	privacyRoutes := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			privacyRead.ServeHTTP(response, request)
			return
		}
		privacyWrite.ServeHTTP(response, request)
	})
	server := &http.Server{
		Addr: listenAddr(),
		Handler: httpapi.NewHandler(httpapi.Options{
			Logger:                   logger,
			CapturePanic:             func(err error) { sentry.CaptureException(err) },
			AdminAuth:                authHandler.Routes(),
			PublicSettings:           settingsHandler.Public(),
			AdminSettingsRead:        settingsHandler.AdminRead(),
			AdminSettingsUpdate:      settingsHandler.AdminUpdate(),
			AdminSettingsPublish:     settingsHandler.AdminPublish(),
			AdminMediaList:           authHandler.Protect(auth.PermissionContentEdit, false, mediaHandler.ListHandler()),
			AdminMediaUpload:         authHandler.Protect(auth.PermissionContentEdit, true, mediaHandler.RequestUploadHandler()),
			AdminMediaRetry:          authHandler.Protect(auth.PermissionContentEdit, true, mediaHandler.RetryUploadHandler()),
			AdminMediaConfirm:        authHandler.Protect(auth.PermissionContentEdit, true, mediaHandler.ConfirmUploadHandler()),
			AdminMediaUpdate:         authHandler.Protect(auth.PermissionContentEdit, true, mediaHandler.UpdateHandler()),
			AdminMediaDelete:         authHandler.Protect(auth.PermissionContentEdit, true, mediaHandler.DeleteHandler()),
			MediaCallback:            mediaHandler.CallbackHandler(),
			PublicMediaAsset:         mediaHandler.PublicAssetHandler(),
			PublicServicesList:       servicesHandler.PublicListHandler(),
			PublicServicesDetail:     servicesHandler.PublicDetailHandler(),
			PublicEnquirySubmit:      enquiryHandler.SubmitHandler(),
			PublicEnquiryChallenge:   enquiries.ChallengeHandler(captchaProvider, captchaSiteKey, captchaEnabled),
			PublicTicketOrderCreate:  ticketOrderHandler.CreateHandler(),
			PublicTicketCheckout:     http.HandlerFunc(paymentHandler.Checkout),
			PublicTicketConfirmation: http.HandlerFunc(ticketHandler.Confirmation),
			PaymentWebhook:           http.HandlerFunc(paymentHandler.Webhook),
			PublicEvents:             publicEventsHandler,
			AdminServicesList:        authHandler.Protect(auth.PermissionContentEdit, false, servicesHandler.AdminListHandler()),
			AdminServicesCreate:      authHandler.Protect(auth.PermissionContentEdit, true, servicesHandler.AdminCreateHandler()),
			AdminServicesOrder:       authHandler.Protect(auth.PermissionContentEdit, true, servicesHandler.AdminOrderHandler()),
			AdminServicesUpdate:      authHandler.Protect(auth.PermissionContentEdit, true, servicesHandler.AdminUpdateHandler()),
			AdminServicesActive:      authHandler.Protect(auth.PermissionContentEdit, true, servicesHandler.AdminActiveHandler()),
			AdminServicesRetire:      authHandler.Protect(auth.PermissionContentEdit, true, servicesHandler.AdminRetireHandler()),
			PublicContentList:        contentHandler.PublicListHandler(),
			PublicContentDetail:      contentHandler.PublicDetailHandler(),
			AdminContentList:         authHandler.Protect(auth.PermissionContentEdit, false, contentHandler.AdminListHandler()),
			AdminContentCreate:       authHandler.Protect(auth.PermissionContentEdit, true, contentHandler.AdminCreateHandler()),
			AdminContentPreview:      authHandler.Protect(auth.PermissionContentEdit, false, contentHandler.AdminPreviewHandler()),
			AdminContentUpdate:       authHandler.Protect(auth.PermissionContentEdit, true, contentHandler.AdminUpdateHandler()),
			AdminContentDelete:       authHandler.Protect(auth.PermissionContentEdit, true, contentHandler.AdminDeleteHandler()),
			AdminContentApproval:     authHandler.Protect(auth.PermissionContentEdit, true, contentHandler.AdminApprovalHandler()),
			AdminContentPublish:      authHandler.Protect(auth.PermissionContentEdit, true, contentHandler.AdminPublicationHandler()),
			AdminEventsRead:          authHandler.Protect(auth.PermissionBookingsManage, false, eventsHandler),
			AdminEventsWrite:         authHandler.Protect(auth.PermissionBookingsManage, true, eventsHandler),
			AdminCRM:                 crmRoutes,
			AdminCRMWorkflow:         workflowRoutes,
			AdminCRMProposalDownload: workflowDownloadRead,
			AdminTicketDeadLetters:   authHandler.Protect(auth.PermissionUsersManage, false, http.HandlerFunc(ticketAdminHandler.DeadLetters)),
			AdminBookings:            bookingRoutes,
			AdminCampaigns:           campaignRoutes,
			AdminTicketOps:           ticketOpsProtected,
			AdminExports:             authHandler.Protect(auth.PermissionAdminAccess, false, exportHandler),
			AdminAudit:               authHandler.Protect(auth.PermissionUsersManage, false, auditHandler),
			AdminAnalytics:           authHandler.Protect(auth.PermissionDashboardsRead, false, analyticsHandler),
			AdminPrivacy:             privacyRoutes,
			AdminSearch:              authHandler.Protect(auth.PermissionAdminAccess, false, searchHandler),
			AdminCheckin:             checkinRoutes,
			AdminTicketAnalytics:     authHandler.Protect(auth.PermissionDashboardsRead, false, ticketAnalyticsHandler),
			PublicAnalyticsTrack:     analyticsHandler.PublicTrack(),
			PublicNewsletter:         newsletterHandler.PublicRoutes(),
			AdminNewsletter:          newsletterAdminRoutes,
			PublicSupport:            supportHandler.PublicRoutes(),
			AdminSupport:             supportAdminRoutes,
			PublicMerch:              merchHandler.PublicRoutes(),
			AdminMerch:               merchAdminRoutes,
			ReadinessChecks: []httpapi.ReadinessCheck{func(ctx context.Context) error {
				return mongoClient.Database().RunCommand(ctx, bson.D{{Key: "ping", Value: 1}}).Err()
			}},
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		if superviseWorker(shutdownContext, logger, "privacy retention", func(ctx context.Context) error {
			return privacyWorker.Run(ctx, 24*time.Hour, 50)
		}) {
			stop()
		}
	}()
	go func() {
		expiry := ticketing.NewExpiryWorker(ticketOrderService, 30*time.Second)
		if superviseWorker(shutdownContext, logger, "ticket hold expiry", expiry.Run) {
			stop()
		}
	}()
	go func() {
		if superviseWorker(shutdownContext, logger, "ticket delivery", func(ctx context.Context) error {
			return ticketDeliveryWorker.Run(ctx, 30*time.Second)
		}) {
			stop()
		}
	}()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			if workerErr := ticketCommWorker.RunOnce(shutdownContext, 100); workerErr != nil && !errors.Is(workerErr, context.Canceled) {
				logger.Error("ticket communication worker failed", "error", workerErr)
			}
			select {
			case <-shutdownContext.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			if workerErr := workflowWorker.QueueOverdue(shutdownContext, 100); workerErr != nil {
				logger.Error("CRM overdue reminder queue failed", "error", workerErr)
			}
			if workerErr := workflowWorker.RunOnce(shutdownContext, 100); workerErr != nil && !errors.Is(workerErr, context.Canceled) {
				logger.Error("CRM notification worker failed", "error", workerErr)
			}
			select {
			case <-shutdownContext.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	// Enquiry intake and enquiry mail share a tick: an enquirer waiting on an
	// acknowledgement and a booker waiting for the lead to appear are the same
	// impatience, and both read from the same submission.
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			if workerErr := crmIntakeWorker.RunOnce(shutdownContext, 100); workerErr != nil && !errors.Is(workerErr, context.Canceled) {
				logger.Error("enquiry CRM intake failed", "error", workerErr)
			}
			if workerErr := enquiryWorker.RunOnce(shutdownContext); workerErr != nil && !errors.Is(workerErr, context.Canceled) {
				logger.Error("enquiry notification worker failed", "error", workerErr)
			}
			select {
			case <-shutdownContext.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	go func() {
		<-shutdownContext.Done()
		deadline, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(deadline); err != nil {
			logger.Error("server shutdown failed", "error", err)
		}
	}()

	logger.Info("api listening", "listen_address", server.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("api stopped unexpectedly", "error", err)
		os.Exit(1)
	}
}

func mustMediaRepository(database *mongo.Database) *media.MongoRepository {
	repository, err := media.NewMongoRepository(database)
	if err != nil {
		panic(err)
	}
	return repository
}

func splitNonempty(value string) []string {
	var result []string
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

// adminURLs answers two questions the console links depend on: where the
// dashboard lives, and which origin proxies its /api/admin calls.
//
// They differ by topology. Served from the public site the console sits under
// a /admin prefix on the same origin; deployed standalone at
// admin.joekuntani.com it sits at the root of its own. Every invitation link,
// CRM notification and signed attachment download is built from these, so
// getting them from one place is what stops the two deployments drifting.
//
// PUBLIC_ADMIN_URL unset keeps the current single-app behaviour, so this is
// safe to ship before the standalone app exists.
func adminURLs() (console string, origin string) {
	if standalone := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_ADMIN_URL")), "/"); standalone != "" {
		parsed, err := url.Parse(standalone)
		if err != nil || parsed.Host == "" {
			return standalone, standalone
		}
		return standalone, parsed.Scheme + "://" + parsed.Host
	}
	web := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_WEB_URL")), "/")
	return web + "/admin", web
}

// listenAddr prefers Render's injected PORT, then API_ADDR, then local :8080.
func listenAddr() string {
	if port := strings.TrimSpace(os.Getenv("PORT")); port != "" {
		if strings.HasPrefix(port, ":") {
			return port
		}
		return ":" + port
	}
	return envOrDefault("API_ADDR", ":8080")
}

// maxWorkerFailures bounds how many consecutive restarts a background worker
// gets before the process gives up and lets the platform restart it.
const maxWorkerFailures = 5

// superviseWorker keeps a background worker running across transient faults and
// reports whether the process should shut down.
//
// These workers return on their first error — ticketing.ExpiryWorker.Run bails
// out the moment a single Expire call fails — and that error used to trigger a
// full API shutdown. One slow Mongo query was therefore enough to take the
// public API offline with it, which is how a loaded database turned into a
// dead site rather than a briefly degraded one. Transient faults now restart
// the worker with linear backoff; a genuinely broken dependency still escalates
// after maxWorkerFailures so the failure stays visible instead of looping
// silently forever.
func superviseWorker(ctx context.Context, logger *slog.Logger, name string, run func(context.Context) error) bool {
	failures := 0
	for ctx.Err() == nil {
		started := time.Now()
		err := run(ctx)
		if err == nil || errors.Is(err, context.Canceled) || ctx.Err() != nil {
			return false
		}
		// A worker that ran healthily for a while before failing is recovering
		// from a new fault, not stuck in a crash loop, so it earns a fresh budget.
		if time.Since(started) > time.Minute {
			failures = 0
		}
		failures++
		if failures >= maxWorkerFailures {
			logger.Error("worker stopped", "worker", name, "error", err, "consecutive_failures", failures)
			return true
		}
		logger.Warn("worker restarting after failure", "worker", name, "error", err, "consecutive_failures", failures)
		select {
		case <-ctx.Done():
			return false
		case <-time.After(time.Duration(failures) * 2 * time.Second):
		}
	}
	return false
}
