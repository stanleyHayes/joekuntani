package services

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
)

type QuestionType string

const (
	QuestionText        QuestionType = "text"
	QuestionTextarea    QuestionType = "textarea"
	QuestionSelect      QuestionType = "select"
	QuestionMultiSelect QuestionType = "multi_select"
	QuestionDate        QuestionType = "date"
	QuestionNumber      QuestionType = "number"
	QuestionCheckbox    QuestionType = "checkbox"
)

type Question struct {
	Key         string       `json:"key" bson:"key"`
	Label       string       `json:"label" bson:"label"`
	HelpText    string       `json:"help_text,omitempty" bson:"help_text,omitempty"`
	Placeholder string       `json:"placeholder,omitempty" bson:"placeholder,omitempty"`
	Type        QuestionType `json:"type" bson:"type"`
	Required    bool         `json:"required" bson:"required"`
	Options     []string     `json:"options,omitempty" bson:"options,omitempty"`
}

type FormSchema struct {
	Version   int        `json:"version" bson:"version"`
	Questions []Question `json:"questions" bson:"questions"`
}

type CTA struct {
	Label string `json:"label" bson:"label"`
	Href  string `json:"href" bson:"href"`
}

type Service struct {
	ID          string     `json:"-" bson:"-"`
	PublicID    string     `json:"id" bson:"public_id"`
	Name        string     `json:"name" bson:"name"`
	Slug        string     `json:"slug" bson:"slug"`
	Summary     string     `json:"summary" bson:"summary"`
	Description string     `json:"description" bson:"description"`
	Category    string     `json:"category" bson:"category"`
	Active      bool       `json:"active" bson:"active"`
	Version     int64      `json:"version" bson:"version"`
	RetiredAt   *time.Time `json:"retired_at,omitempty" bson:"retired_at,omitempty"`
	SortOrder   int        `json:"sort_order" bson:"sort_order"`
	FormSchema  FormSchema `json:"form_schema" bson:"form_schema"`
	CTA         CTA        `json:"cta" bson:"cta"`
	CreatedAt   time.Time  `json:"created_at" bson:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" bson:"updated_at"`
}

type LifecycleState string

const (
	StateActive   LifecycleState = "active"
	StateInactive LifecycleState = "inactive"
	StateRetired  LifecycleState = "retired"
)

func (service Service) State() LifecycleState {
	if service.RetiredAt != nil {
		return StateRetired
	}
	if service.Active {
		return StateActive
	}
	return StateInactive
}

func (service Service) MarshalJSON() ([]byte, error) {
	type serviceAlias Service
	return json.Marshal(struct {
		serviceAlias
		State LifecycleState `json:"state"`
	}{serviceAlias: serviceAlias(service), State: service.State()})
}

type OrderItem struct {
	ID      string `json:"id"`
	Version int64  `json:"version"`
}

type Input struct {
	Name, Summary, Description, Category string
	Active                               bool
	SortOrder                            int
	FormSchema                           FormSchema
	CTA                                  CTA
}

var (
	ErrNotFound      = errors.New("service not found")
	ErrConflict      = errors.New("service conflict")
	ErrForbidden     = errors.New("service mutation forbidden")
	ErrInvalid       = errors.New("invalid service")
	slugPattern      = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	questionKey      = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
	uuidPattern      = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	allowedQuestions = map[QuestionType]bool{QuestionText: true, QuestionTextarea: true, QuestionSelect: true, QuestionMultiSelect: true, QuestionDate: true, QuestionNumber: true, QuestionCheckbox: true}
)

func Slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var result strings.Builder
	dash := false
	for _, r := range value {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			result.WriteRune(r)
			dash = false
		} else if result.Len() > 0 && !dash {
			result.WriteByte('-')
			dash = true
		}
	}
	return strings.TrimSuffix(result.String(), "-")
}

func (input *Input) Normalize() {
	input.Name = strings.TrimSpace(input.Name)
	input.Summary = strings.TrimSpace(input.Summary)
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	input.CTA.Label = strings.TrimSpace(input.CTA.Label)
	input.CTA.Href = strings.TrimSpace(input.CTA.Href)
	for index := range input.FormSchema.Questions {
		question := &input.FormSchema.Questions[index]
		question.Key = strings.TrimSpace(question.Key)
		question.Label = strings.TrimSpace(question.Label)
		question.HelpText = strings.TrimSpace(question.HelpText)
		question.Placeholder = strings.TrimSpace(question.Placeholder)
		for optionIndex := range question.Options {
			question.Options[optionIndex] = strings.TrimSpace(question.Options[optionIndex])
		}
	}
}

func (input Input) Validate() error {
	if len(input.Name) < 2 || len(input.Name) > 120 || len(input.Summary) > 280 || len(input.Description) > 8000 || len(input.Category) > 80 {
		return ErrInvalid
	}
	if input.SortOrder < 0 || input.SortOrder > 10000 || input.FormSchema.Version != 1 || len(input.FormSchema.Questions) > 30 {
		return ErrInvalid
	}
	if len(input.CTA.Label) < 2 || len(input.CTA.Label) > 80 || input.CTA.Href != "/book" {
		return ErrInvalid
	}
	seen := make(map[string]bool, len(input.FormSchema.Questions))
	for _, question := range input.FormSchema.Questions {
		if !questionKey.MatchString(question.Key) || seen[question.Key] || !allowedQuestions[question.Type] || len(question.Label) < 2 || len(question.Label) > 160 || len(question.HelpText) > 400 || len(question.Placeholder) > 160 {
			return ErrInvalid
		}
		seen[question.Key] = true
		needsOptions := question.Type == QuestionSelect || question.Type == QuestionMultiSelect
		if needsOptions && (len(question.Options) < 2 || len(question.Options) > 20) || !needsOptions && len(question.Options) != 0 {
			return ErrInvalid
		}
		optionSeen := map[string]bool{}
		for _, option := range question.Options {
			if option == "" || len(option) > 100 || optionSeen[strings.ToLower(option)] {
				return ErrInvalid
			}
			optionSeen[strings.ToLower(option)] = true
		}
	}
	return nil
}

func ValidSlug(value string) bool     { return len(value) <= 120 && slugPattern.MatchString(value) }
func ValidPublicID(value string) bool { return uuidPattern.MatchString(value) }
