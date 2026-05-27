package parity

type ComparisonMode string

const (
	ModeExact      ComparisonMode = "exact"
	ModeSemantic   ComparisonMode = "semantic"
	ModeNormalized ComparisonMode = "normalized"
)

type FixtureManifestEntry struct {
	ID             string         `json:"id"`
	Category       string         `json:"category"`
	Tier           int            `json:"tier"`
	Operation      string         `json:"operation"`
	ComparisonMode ComparisonMode `json:"comparisonMode"`
	Path           string         `json:"path"`
}

type FixtureManifest struct {
	Version     int                    `json:"version"`
	Suite       string                 `json:"suite"`
	Description string                 `json:"description"`
	Fixtures    []FixtureManifestEntry `json:"fixtures"`
}

type FixtureStep struct {
	Operation string                 `json:"operation"`
	Inputs    map[string]interface{} `json:"inputs"`
}

type FixtureFile struct {
	ID             string                 `json:"id"`
	Title          string                 `json:"title"`
	Category       string                 `json:"category"`
	Tier           int            `json:"tier"`
	Operation      string                 `json:"operation"`
	ComparisonMode ComparisonMode         `json:"comparisonMode"`
	Inputs         map[string]interface{} `json:"inputs"`
	Steps          []FixtureStep          `json:"steps"`
	Workspace      *FixtureWorkspaceSpec  `json:"workspace"`
	Timing         *FixtureTimingSpec     `json:"timing"`
}

type FixtureWorkspaceSpec struct {
	Root      string   `json:"root"`
	SeedFiles []string `json:"seedFiles"`
}

type FixtureTimingSpec struct {
	MaxWallClockMs int `json:"maxWallClockMs"`
}

type ExpectedResult struct {
	Ok     *bool                  `json:"ok"`
	Code   *string                `json:"code"`
	Output *ExpectedOutputSpec    `json:"output"`
	Error  *ExpectedErrorSpec     `json:"error"`
	Meta   *ExpectedMetaSpec      `json:"meta"`
	Files  *ExpectedFilesSpec     `json:"files"`
}

type ExpectedOutputSpec struct {
	Equals      *string             `json:"equals"`
	Contains    []string            `json:"contains"`
	NotContains []string            `json:"notContains"`
	Length      *ExpectedLengthSpec `json:"length"`
}

type ExpectedLengthSpec struct {
	Equals *int `json:"equals"`
	Min    *int `json:"min"`
	Max    *int `json:"max"`
}

type ExpectedErrorSpec struct {
	Equals      *string  `json:"equals"`
	Contains    []string `json:"contains"`
	NotContains []string `json:"notContains"`
}

type ExpectedMetaSpec struct {
	Truncated  *bool   `json:"truncated"`
	TimedOut   *bool   `json:"timedOut"`
	ExitCode   *int    `json:"exitCode"`
	Signal     *string `json:"signal"`
	LimitBytes *int    `json:"limitBytes"`
}

type ExpectedFilesSpec struct {
	Changed            []string            `json:"changed"`
	Unchanged          []string            `json:"unchanged"`
	ContentEquals      map[string]string   `json:"contentEquals"`
	ContentContains    map[string][]string `json:"contentContains"`
	ContentNotContains map[string][]string `json:"contentNotContains"`
	Exists             []string            `json:"exists"`
	NotExists          []string            `json:"notExists"`
}

type NormalizedResult struct {
	Ok     bool
	Code   *string
	Output *string
	Error  *string
	Meta   NormalizedMeta
}

type NormalizedMeta struct {
	Truncated  *bool
	TimedOut   *bool
	ExitCode   *int
	Signal     *string
	LimitBytes *int
}

type SnapshotEntry struct {
	Exists  bool
	Content string
}
