package events

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

type ActorResolver func(*http.Request) (Actor, error)

type Handler struct {
	service *Service
	actor   ActorResolver
}

func NewHandler(service *Service, actor ActorResolver) *Handler {
	return &Handler{service: service, actor: actor}
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	actor, err := handler.actor(request)
	if err != nil {
		writeError(writer, ErrForbidden)
		return
	}
	path := request.URL.Path
	if path == "/api/admin/events" {
		handler.collection(writer, request, actor)
		return
	}
	const prefix = "/api/admin/events/"
	if len(path) <= len(prefix) || path[:len(prefix)] != prefix {
		writeProblem(writer, http.StatusNotFound)
		return
	}
	parts := splitPath(path[len(prefix):])
	if len(parts) == 1 {
		handler.event(writer, request, actor, parts[0])
		return
	}
	if len(parts) == 2 {
		switch parts[1] {
		case "preview":
			handler.preview(writer, request, actor, parts[0])
		case "publish", "cancel":
			handler.transition(writer, request, actor, parts[0], parts[1])
		case "tickets":
			handler.tickets(writer, request, actor, parts[0])
		default:
			writeProblem(writer, http.StatusNotFound)
		}
		return
	}
	if len(parts) == 3 && parts[1] == "tickets" {
		handler.ticket(writer, request, actor, parts[0], parts[2])
		return
	}
	if len(parts) == 4 && parts[1] == "tickets" && (parts[3] == "pause" || parts[3] == "resume") {
		handler.ticketState(writer, request, actor, parts[0], parts[2], parts[3] == "pause")
		return
	}
	writeProblem(writer, http.StatusNotFound)
}

func (handler *Handler) collection(writer http.ResponseWriter, request *http.Request, actor Actor) {
	switch request.Method {
	case http.MethodGet:
		items, err := handler.service.List(request.Context(), actor)
		writeJSON(writer, http.StatusOK, map[string]any{"items": items}, err)
	case http.MethodPost:
		var input EventInput
		if decodeJSON(writer, request, &input) != nil {
			writeError(writer, ErrInvalid)
			return
		}
		item, err := handler.service.Create(request.Context(), actor, input)
		writeJSON(writer, http.StatusCreated, item, err)
	default:
		writeProblem(writer, http.StatusMethodNotAllowed)
	}
}

func (handler *Handler) event(writer http.ResponseWriter, request *http.Request, actor Actor, id string) {
	if request.Method != http.MethodPut {
		writeProblem(writer, http.StatusMethodNotAllowed)
		return
	}
	var input EventInput
	if decodeJSON(writer, request, &input) != nil {
		writeError(writer, ErrInvalid)
		return
	}
	item, err := handler.service.Update(request.Context(), actor, id, input)
	writeJSON(writer, http.StatusOK, item, err)
}

func (handler *Handler) preview(writer http.ResponseWriter, request *http.Request, actor Actor, id string) {
	if request.Method != http.MethodGet {
		writeProblem(writer, http.StatusMethodNotAllowed)
		return
	}
	writer.Header().Set("Cache-Control", "private, no-store")
	event, tickets, err := handler.service.Preview(request.Context(), actor, id)
	writeJSON(writer, http.StatusOK, map[string]any{"event": event, "tickets": tickets}, err)
}

func (handler *Handler) ticket(writer http.ResponseWriter, request *http.Request, actor Actor, eventID, ticketID string) {
	if request.Method != http.MethodPut {
		writeProblem(writer, http.StatusMethodNotAllowed)
		return
	}
	var input TicketInput
	if decodeJSON(writer, request, &input) != nil {
		writeError(writer, ErrInvalid)
		return
	}
	ticket, err := handler.service.UpdateTicket(request.Context(), actor, eventID, ticketID, input)
	writeJSON(writer, http.StatusOK, ticket, err)
}

func (handler *Handler) transition(writer http.ResponseWriter, request *http.Request, actor Actor, id, action string) {
	if request.Method != http.MethodPost {
		writeProblem(writer, http.StatusMethodNotAllowed)
		return
	}
	var event Event
	var err error
	if action == "publish" {
		event, err = handler.service.Publish(request.Context(), actor, id)
	} else {
		event, err = handler.service.Cancel(request.Context(), actor, id)
	}
	writeJSON(writer, http.StatusOK, event, err)
}

func (handler *Handler) tickets(writer http.ResponseWriter, request *http.Request, actor Actor, eventID string) {
	if request.Method != http.MethodPost {
		writeProblem(writer, http.StatusMethodNotAllowed)
		return
	}
	var input TicketInput
	if decodeJSON(writer, request, &input) != nil {
		writeError(writer, ErrInvalid)
		return
	}
	ticket, err := handler.service.CreateTicket(request.Context(), actor, eventID, input)
	writeJSON(writer, http.StatusCreated, ticket, err)
}

func (handler *Handler) ticketState(writer http.ResponseWriter, request *http.Request, actor Actor, eventID, ticketID string, paused bool) {
	if request.Method != http.MethodPost {
		writeProblem(writer, http.StatusMethodNotAllowed)
		return
	}
	ticket, err := handler.service.SetTicketPaused(request.Context(), actor, eventID, ticketID, paused)
	writeJSON(writer, http.StatusOK, ticket, err)
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, target any) error {
	request.Body = http.MaxBytesReader(writer, request.Body, 128<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return ErrInvalid
	}
	return nil
}

func writeJSON(writer http.ResponseWriter, status int, payload any, err error) {
	if err != nil {
		writeError(writer, err)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, ErrForbidden):
		status = http.StatusForbidden
	case errors.Is(err, ErrInvalid):
		status = http.StatusUnprocessableEntity
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, ErrConflict):
		status = http.StatusConflict
	}
	writeProblem(writer, status)
}

func writeProblem(writer http.ResponseWriter, status int) {
	writer.Header().Set("Content-Type", "application/problem+json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{
		"type": "about:blank", "title": http.StatusText(status), "status": status,
	})
}

func splitPath(value string) []string {
	result := []string{}
	start := 0
	for index := 0; index <= len(value); index++ {
		if index == len(value) || value[index] == '/' {
			if index > start {
				result = append(result, value[start:index])
			}
			start = index + 1
		}
	}
	return result
}
