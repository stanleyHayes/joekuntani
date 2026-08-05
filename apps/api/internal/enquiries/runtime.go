package enquiries

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
)

type ConfiguredRiskAssessor struct{ CaptchaEnabled bool }

func (r ConfiguredRiskAssessor) Assess(context.Context, Submission) Risk {
	return Risk{CaptchaRequired: r.CaptchaEnabled}
}

type RemoteCaptcha struct {
	endpoint, secret string
	client           *http.Client
}

func NewRemoteCaptcha(endpoint, secret string, client *http.Client) (*RemoteCaptcha, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || strings.TrimSpace(secret) == "" {
		return nil, errors.New("captcha endpoint must be HTTPS and secret is required")
	}
	if client == nil {
		client = http.DefaultClient
	}
	return &RemoteCaptcha{endpoint: endpoint, secret: secret, client: client}, nil
}
func (c *RemoteCaptcha) Verify(ctx context.Context, token, clientIP string) (bool, error) {
	if strings.TrimSpace(token) == "" {
		return false, nil
	}
	form := url.Values{"secret": {c.secret}, "response": {token}, "remoteip": {clientIP}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := c.client.Do(req)
	if err != nil {
		return false, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return false, errors.New("captcha provider unavailable")
	}
	var result struct {
		Success bool `json:"success"`
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 32<<10)).Decode(&result); err != nil {
		return false, err
	}
	return result.Success, nil
}

func TrustedProxyPredicate(cidrs []string) (func(net.IP) bool, error) {
	networks := make([]*net.IPNet, 0, len(cidrs))
	for _, raw := range cidrs {
		_, network, err := net.ParseCIDR(strings.TrimSpace(raw))
		if err != nil {
			return nil, err
		}
		networks = append(networks, network)
	}
	return func(ip net.IP) bool {
		for _, network := range networks {
			if network.Contains(ip) {
				return true
			}
		}
		return false
	}, nil
}
