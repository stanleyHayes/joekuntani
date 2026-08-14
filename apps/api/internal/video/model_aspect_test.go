package video

import "testing"

func TestResolvedAspectRatioReducesTheMeasuredFrame(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name          string
		width, height int
		want          string
	}{
		{"landscape HD", 1920, 1080, "16:9"},
		{"landscape 4K", 3840, 2160, "16:9"},
		{"portrait phone", 1080, 1920, "9:16"},
		{"square", 1080, 1080, "1:1"},
		{"four by five", 1080, 1350, "4:5"},
		{"broadcast", 640, 480, "4:3"},
		{"an odd frame stays exact", 1001, 1000, "1001:1000"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			item := Item{Width: testCase.width, Height: testCase.height}
			if got := item.ResolvedAspectRatio(); got != testCase.want {
				t.Fatalf("ResolvedAspectRatio() = %q, want %q", got, testCase.want)
			}
		})
	}
}

// Before the provider reports a frame there is nothing to reduce, and every
// video on the page was assumed to be 16:9 before any of this existed.
func TestResolvedAspectRatioFallsBackToLandscape(t *testing.T) {
	t.Parallel()
	for _, item := range []Item{{}, {Width: 1920}, {Height: 1080}, {Width: -4, Height: 3}} {
		if got := item.ResolvedAspectRatio(); got != "16:9" {
			t.Fatalf("ResolvedAspectRatio() = %q for %#v, want 16:9", got, item)
		}
	}
}

func TestResolvedAspectRatioPrefersTheOverride(t *testing.T) {
	t.Parallel()
	item := Item{Width: 1920, Height: 1080, AspectRatio: "9:16"}
	if got := item.ResolvedAspectRatio(); got != "9:16" {
		t.Fatalf("ResolvedAspectRatio() = %q, want the override 9:16", got)
	}
}

func TestValidAspectRatioAcceptsEmptyAndRejectsNonsense(t *testing.T) {
	t.Parallel()
	for _, value := range []string{"", "16:9", "9:16", "1:1", "1001:1000"} {
		if !validAspectRatio(value) {
			t.Errorf("validAspectRatio(%q) = false, want true", value)
		}
	}
	for _, value := range []string{"0:9", "16:0", "16/9", "16:9 ", "-16:9", "sixteen:nine", "16:9:1", "123456:1"} {
		if validAspectRatio(value) {
			t.Errorf("validAspectRatio(%q) = true, want false", value)
		}
	}
}
