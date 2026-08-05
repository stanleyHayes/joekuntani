package enquiries

import "time"

type Contact struct {
	Name         string `json:"name" bson:"name"`
	Email        string `json:"email" bson:"email"`
	Phone        string `json:"phone" bson:"phone"`
	Organization string `json:"organization" bson:"organization"`
	Role         string `json:"role" bson:"role"`
	Country      string `json:"country" bson:"country"`
}

type Details struct {
	EventType             string   `json:"event_type" bson:"event_type"`
	EventAt               string   `json:"event_at" bson:"event_at"`
	Venue                 string   `json:"venue" bson:"venue"`
	City                  string   `json:"city" bson:"city"`
	Country               string   `json:"country" bson:"country"`
	AudienceSize          int      `json:"audience_size" bson:"audience_size"`
	PerformanceDuration   string   `json:"performance_duration" bson:"performance_duration"`
	ProductionNeeds       string   `json:"production_needs" bson:"production_needs"`
	CampaignObjective     string   `json:"campaign_objective" bson:"campaign_objective"`
	TargetAudience        string   `json:"target_audience" bson:"target_audience"`
	Channels              []string `json:"channels" bson:"channels"`
	RequestedDeliverables string   `json:"requested_deliverables" bson:"requested_deliverables"`
	UsageRights           string   `json:"usage_rights" bson:"usage_rights"`
	Exclusivity           string   `json:"exclusivity" bson:"exclusivity"`
	LaunchDates           string   `json:"launch_dates" bson:"launch_dates"`
}

type Submission struct {
	ServiceID        string         `json:"service_id"`
	EnquiryType      string         `json:"enquiry_type"`
	Source           string         `json:"source"`
	Contact          Contact        `json:"contact"`
	Answers          map[string]any `json:"answers"`
	ProjectBrief     string         `json:"project_brief"`
	Budget           string         `json:"budget"`
	Timeline         string         `json:"timeline"`
	Currency         string         `json:"currency"`
	DecisionDeadline string         `json:"decision_deadline"`
	AdditionalNotes  string         `json:"additional_notes"`
	Details          Details        `json:"details"`
	MarketingConsent bool           `json:"marketing_consent"`
	Consent          bool           `json:"consent"`
	ConsentText      string         `json:"consent_text"`
	ConsentVersion   string         `json:"consent_version"`
	Honeypot         string         `json:"website"`
	CaptchaToken     string         `json:"captcha_token"`
	IdempotencyKey   string         `json:"-"`
	ClientIP         string         `json:"-"`
}

type Enquiry struct {
	PublicID, Reference, ServiceID              string
	Contact                                     Contact
	EnquiryType, Source                         string
	Details                                     Details
	Answers                                     map[string]any
	ProjectBrief, Budget, Timeline              string
	Currency, DecisionDeadline, AdditionalNotes string
	MarketingConsent                            bool
	ConsentText, ConsentVersion                 string
	ConsentAt, CreatedAt                        time.Time
	IPHash                                      string
}

type OutboxMessage struct {
	PublicID, EnquiryID, Kind string
	Attempts                  int
	NextAttemptAt             time.Time
	DeadLetteredAt            *time.Time
}

type Receipt struct {
	Reference string `json:"reference"`
	Stored    bool   `json:"-"`
}

type Risk struct {
	Score           int
	CaptchaRequired bool
}
