package crm

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"
)

type MemoryStore struct {
	mu            sync.Mutex
	organizations map[string]Organization
	contacts      map[string]Contact
	enquiries     map[string]Enquiry
	views         map[string]SavedView
	sources       map[string]SourceEnquiry
	audits        []AuditEvent
	FailAudit     bool
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{organizations: map[string]Organization{}, contacts: map[string]Contact{}, enquiries: map[string]Enquiry{}, views: map[string]SavedView{}, sources: map[string]SourceEnquiry{}}
}
func (s *MemoryStore) CreateOrganization(_ context.Context, item Organization, audit AuditEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.FailAudit {
		return ErrConflict
	}
	for _, v := range s.organizations {
		if v.DeletedAt == nil && strings.EqualFold(v.Name, item.Name) {
			return ErrConflict
		}
	}
	s.organizations[item.PublicID] = item
	s.audits = append(s.audits, audit)
	return nil
}
func (s *MemoryStore) FindOrganizationByNormalizedName(_ context.Context, name string) (Organization, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range s.organizations {
		if item.DeletedAt == nil && item.NormalizedName == name {
			return item, nil
		}
	}
	return Organization{}, ErrNotFound
}
func (s *MemoryStore) SoftDeleteOrganization(_ context.Context, id string, at time.Time, audit AuditEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.organizations[id]
	if !ok || item.DeletedAt != nil {
		return ErrNotFound
	}
	if s.organizationReferenced(id, "") {
		return ErrConflict
	}
	if s.FailAudit {
		return ErrConflict
	}
	item.DeletedAt, item.UpdatedAt = &at, at
	s.organizations[id] = item
	s.audits = append(s.audits, audit)
	return nil
}
func (s *MemoryStore) CreateContact(_ context.Context, item Contact, audit AuditEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.FailAudit {
		return ErrConflict
	}
	if item.OrganizationID != "" {
		org, ok := s.organizations[item.OrganizationID]
		if !ok || org.DeletedAt != nil {
			return ErrNotFound
		}
	}
	for _, v := range s.contacts {
		if v.DeletedAt == nil && matches(v, item.NormalizedEmail, item.NormalizedPhone) {
			return ErrConflict
		}
	}
	s.contacts[item.PublicID] = item
	s.audits = append(s.audits, audit)
	return nil
}
func (s *MemoryStore) SoftDeleteContact(_ context.Context, id string, at time.Time, audit AuditEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.contacts[id]
	if !ok || item.DeletedAt != nil {
		return ErrNotFound
	}
	for _, enquiry := range s.enquiries {
		if enquiry.ContactID == id && enquiry.DeletedAt == nil {
			return ErrConflict
		}
	}
	if s.FailAudit {
		return ErrConflict
	}
	item.DeletedAt, item.UpdatedAt = &at, at
	s.contacts[id] = item
	s.audits = append(s.audits, audit)
	return nil
}
func (s *MemoryStore) FindContact(_ context.Context, id string) (Contact, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.contacts[id]
	if !ok || v.DeletedAt != nil {
		return Contact{}, ErrNotFound
	}
	return v, nil
}
func (s *MemoryStore) FindContactByLookup(_ context.Context, email, phone string) (Contact, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if email == "" && phone == "" {
		return Contact{}, ErrNotFound
	}
	for _, v := range s.contacts {
		if v.DeletedAt == nil && matches(v, email, phone) {
			return v, nil
		}
	}
	return Contact{}, ErrNotFound
}
func (s *MemoryStore) CreateEnquiry(_ context.Context, item Enquiry, audit AuditEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.FailAudit {
		return ErrConflict
	}
	if _, ok := s.sources[item.SourceEnquiryID]; !ok {
		return ErrNotFound
	}
	contact, ok := s.contacts[item.ContactID]
	if !ok || contact.DeletedAt != nil {
		return ErrNotFound
	}
	if item.OrganizationID != "" && item.OrganizationID != contact.OrganizationID {
		return ErrConflict
	}
	for _, v := range s.enquiries {
		if v.SourceEnquiryID == item.SourceEnquiryID {
			return ErrConflict
		}
	}
	s.enquiries[item.PublicID] = item
	s.audits = append(s.audits, audit)
	return nil
}
func (s *MemoryStore) ResolveSourceEnquiry(_ context.Context, id string) (SourceEnquiry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.sources[id]
	if !ok {
		return SourceEnquiry{}, ErrNotFound
	}
	return item, nil
}
func (s *MemoryStore) SeedSource(item SourceEnquiry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sources[item.PublicID] = item
}
func (s *MemoryStore) Source(id string) (SourceEnquiry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.sources[id]
	return item, ok
}
func (s *MemoryStore) ListEnquiries(_ context.Context, f EnquiryFilter) ([]Enquiry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := []Enquiry{}
	for _, v := range s.enquiries {
		if !f.IncludeDeleted && v.DeletedAt != nil {
			continue
		}
		if f.OwnerID != "" && v.OwnerID != f.OwnerID || f.ServiceID != "" && v.ServiceID != f.ServiceID || f.OrganizationID != "" && v.OrganizationID != f.OrganizationID || !containsStage(f.Stages, v.Stage) || !containsString(f.Sources, v.Source) {
			continue
		}
		if q := strings.ToLower(f.Query); q != "" && !strings.Contains(strings.ToLower(v.Reference+" "+v.Summary), q) {
			continue
		}
		result = append(result, v)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt.After(result[j].CreatedAt) })
	return result, nil
}
func (s *MemoryStore) UpdateEnquiry(_ context.Context, id string, mutate func(*Enquiry) error, audit AuditEvent) (Enquiry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.enquiries[id]
	if !ok {
		return Enquiry{}, ErrNotFound
	}
	if err := mutate(&v); err != nil {
		return Enquiry{}, err
	}
	if s.FailAudit {
		return Enquiry{}, ErrConflict
	}
	s.enquiries[id] = v
	s.audits = append(s.audits, audit)
	return v, nil
}
func (s *MemoryStore) SaveView(_ context.Context, v SavedView, audit AuditEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.FailAudit {
		return ErrConflict
	}
	for _, existing := range s.views {
		if existing.OwnerID == v.OwnerID && strings.EqualFold(existing.Name, v.Name) {
			return ErrConflict
		}
	}
	s.views[v.PublicID] = v
	s.audits = append(s.audits, audit)
	return nil
}
func (s *MemoryStore) ListViews(_ context.Context, owner string) ([]SavedView, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := []SavedView{}
	for _, v := range s.views {
		if v.OwnerID == owner {
			result = append(result, v)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result, nil
}
func (s *MemoryStore) PrivacyExport(_ context.Context, contactID string, audit AuditEvent) (Contact, *Organization, []Enquiry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	contact, ok := s.contacts[contactID]
	if !ok || contact.DeletedAt != nil {
		return Contact{}, nil, nil, ErrNotFound
	}
	if s.FailAudit {
		return Contact{}, nil, nil, ErrConflict
	}
	var org *Organization
	if contact.OrganizationID != "" {
		if value, ok := s.organizations[contact.OrganizationID]; ok && value.DeletedAt == nil {
			copy := value
			org = &copy
		}
	}
	items := []Enquiry{}
	for _, v := range s.enquiries {
		if v.ContactID == contactID {
			items = append(items, v)
		}
	}
	s.audits = append(s.audits, audit)
	return contact, org, items, nil
}
func (s *MemoryStore) PrivacyDelete(_ context.Context, contactID string, at time.Time, audit AuditEvent) (PrivacyDeleteResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	contact, ok := s.contacts[contactID]
	if !ok || contact.DeletedAt != nil {
		return PrivacyDeleteResult{}, ErrNotFound
	}
	if s.FailAudit {
		return PrivacyDeleteResult{}, ErrConflict
	}
	result := PrivacyDeleteResult{Contacts: 1}
	orgID := contact.OrganizationID
	contact.Name, contact.Email, contact.Phone, contact.Role, contact.CountryCode, contact.NormalizedEmail, contact.NormalizedPhone = "Deleted contact", "", "", "", "", "", ""
	contact.OrganizationID = ""
	contact.DeletedAt = &at
	contact.UpdatedAt = at
	s.contacts[contactID] = contact
	for id, v := range s.enquiries {
		if v.ContactID == contactID {
			source := s.sources[v.SourceEnquiryID]
			source.Contact = SourceContact{Name: "Deleted contact", Email: "deleted@example.invalid", Role: "Deleted", Country: "ZZ"}
			s.sources[v.SourceEnquiryID] = source
			v.ContactID = ""
			v.Summary = ""
			v.DeletedAt = &at
			v.UpdatedAt = at
			s.enquiries[id] = v
			result.Enquiries++
		}
	}
	if orgID != "" && !s.organizationReferenced(orgID, contactID) {
		org := s.organizations[orgID]
		org.Name = "Deleted organization"
		org.NormalizedName = "deleted-" + orgID
		org.Website = ""
		org.CountryCode = ""
		org.DeletedAt = &at
		org.UpdatedAt = at
		s.organizations[orgID] = org
		result.Organizations = 1
	}
	s.audits = append(s.audits, audit)
	return result, nil
}
func (s *MemoryStore) organizationReferenced(orgID, except string) bool {
	for id, v := range s.contacts {
		if id != except && v.DeletedAt == nil && v.OrganizationID == orgID {
			return true
		}
	}
	return false
}
func (s *MemoryStore) Audits() []AuditEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]AuditEvent(nil), s.audits...)
}
func matches(v Contact, email, phone string) bool {
	return email != "" && v.NormalizedEmail == email || phone != "" && v.NormalizedPhone == phone
}
func containsStage(values []Stage, want Stage) bool {
	if len(values) == 0 {
		return true
	}
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
func containsString(values []string, want string) bool {
	if len(values) == 0 {
		return true
	}
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}

var _ Store = (*MemoryStore)(nil)
