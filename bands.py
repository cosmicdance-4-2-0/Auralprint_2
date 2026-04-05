"""256-band spectral decomposition with selectable frequency spacing.

Interface (stable):
    compute(analysis, samplerate) -> BandResult | None
    names:   tuple of 256 band names
    colors:  (256, 3) float32 RGB array (rainbow palette)
    spacing: str — the active spacing mode (read-only after init)
"""

import numpy as np

BAND_COUNT = 256
FLOOR_HZ = 20.0
CEILING_HZ = 20000.0

DB_FLOOR = -80.0
DB_CEIL = 0.0

RAINBOW_SATURATION = 0.85
RAINBOW_VALUE = 0.90

SPACING_MODES = ("log", "mel", "bark", "hybrid")

# fmt: off
BAND_NAMES = (
    # 0–31  Planetary Core
    "Eternal Core",        "Nickel Forge",         "Iron Heartbeat",       "Primordial Mantle",
    "Lithic Roar",         "Subduction Song",      "Magma Heart",          "Rift Whisper",
    "Volcanic Pulse",      "Crustal Thunder",      "Tectonic Echo",        "Seismic Lullaby",
    "Planetary Forge",     "Core Resonance",       "Mantle Dream",         "Abyssal Maw",
    "Hadal Thunder",       "Trench Oracle",        "Benthic Choir",        "Pressure Veil",
    "Deep Mantle Song",    "Geothermal Hum",       "Iron Core Pulse",      "Nickel Veil",
    "Primordial Roar",     "Subterranean Whisper", "Lithosphere Pulse",    "Mantle Chamber",
    "Core Song",           "Planetary Heart",      "Eternal Forge",        "Deepest Resonance",

    # 32–63  Oceans & Tectonics
    "Mariana Pulse",       "Hadal Depths",         "Oceanic Spine",        "Continental Rumble",
    "Mountain Root",       "Ancient Soil",         "Seabed Choir",         "Trench Echo",
    "Pelagic Dream",       "Abyssal Current",      "Hydrothermal Song",    "Pressure Chamber",
    "Oceanic Veil",        "Tectonic Drift",       "Rift Valley Hum",      "Submarine Thunder",
    "Coral Heart",         "Deep Current Pulse",   "Ocean Floor Forge",    "Benthic Resonance",
    "Mariana Whisper",     "Hadal Lullaby",        "Pelagic Roar",         "Continental Song",
    "Seabed Pulse",        "Trench Heart",         "Abyssal Forge",        "Oceanic Dream",
    "Pressure Song",       "Deep Sea Resonance",   "Hydrothermal Veil",    "Mariana Core",

    # 64–95  Biosphere & Living Crust
    "Forest Floor",        "Canopy Breath",        "Jungle Canopy",        "Savanna Heart",
    "River Stone",         "Earth Breath",         "Gaia Hum",             "Biosphere Song",
    "Thunder Root",        "Storm Cradle",         "Wind Weaver",          "Cloud Chamber",
    "Dawn Chorus",         "Human Veil",           "Vocal Ridge",          "Breath Chamber",
    "Presence Spark",      "Clarity Thread",       "Life Resonance",       "Soil Symphony",
    "Root Network",        "Leaf Whisper",         "Pollen Pulse",         "Mycelial Song",
    "Rainforest Hum",      "Savanna Pulse",        "River Echo",           "Earth Song",
    "Gaia Pulse",          "Biosphere Veil",       "Life Thread",          "Organic Resonance",

    # 96–127  Human Voice & Emotional Presence
    "Vocal Spark",         "Throat Chamber",       "Chest Resonance",      "Nasal Veil",
    "Presence Ridge",      "Clarity Peak",         "Sibilant Edge",        "Bite Burst",
    "Air Shelf",           "Breath Spark",         "Voice Thread",         "Human Hum",
    "Emotional Core",      "Soul Whisper",         "Heartbeat Echo",       "Vocal Forge",
    "Presence Veil",       "Clarity Song",         "Sibilance Dream",      "Air Resonance",
    "Breath Pulse",        "Voice Lullaby",        "Human Spark",          "Emotional Veil",
    "Soul Pulse",          "Heart Song",           "Vocal Dream",          "Presence Core",
    "Clarity Forge",       "Sibilant Whisper",     "Air Heart",            "Breath Resonance",

    # 128–159  Lower Atmosphere
    "Tropospheric Dance",  "Cloud Weaver",         "Storm Pulse",          "Rain Veil",
    "Lightning Thread",    "Wind Ridge",           "Fog Chamber",          "Mist Spark",
    "Dawn Veil",           "Dusk Echo",            "Twilight Hum",         "Atmosphere Song",
    "Weather Pulse",       "Cumulus Heart",        "Stratus Whisper",      "Nimbus Resonance",
    "Thunder Song",        "Lightning Dream",      "Raindrop Pulse",       "Wind Forge",
    "Cloud Veil",          "Mist Thread",          "Fog Resonance",        "Dawn Spark",
    "Dusk Lullaby",        "Twilight Pulse",       "Atmosphere Veil",      "Weather Song",
    "Cumulus Echo",        "Stratus Dream",        "Nimbus Heart",         "Thunder Veil",

    # 160–191  Upper Atmosphere & Ionosphere
    "Lightning Veil",      "Aurora Thread",        "Ion Whisper",          "Magnetosphere Ring",
    "Solar Wind Hymn",     "Helios Harp",          "Van Allen Veil",       "Orbital Echo",
    "Lunar Reflection",    "Meteor Shimmer",       "Exospheric Spark",     "Satellite Choir",
    "Stratospheric Veil",  "Ionospheric Dance",    "Aurora Pulse",         "Magneto Song",
    "Solar Veil",          "Helios Dream",         "Van Allen Pulse",      "Orbital Whisper",
    "Lunar Heart",         "Meteor Forge",         "Exospheric Hum",       "Satellite Resonance",
    "Stratospheric Song",  "Ionospheric Spark",    "Aurora Lullaby",       "Magneto Veil",
    "Solar Pulse",         "Helios Resonance",     "Van Allen Dream",      "Orbital Song",

    # 192–223  Solar System
    "Lunar Reflection",    "Mars Dust",            "Jovian Thunder",       "Saturn Ring Song",
    "Venus Veil",          "Mercury Pulse",        "Neptune Whisper",      "Uranus Dream",
    "Pluto Edge",          "Asteroid Shimmer",     "Comet Trail",          "Solar Flare Heart",
    "Coronal Song",        "Heliosphere Veil",     "Interplanetary Hum",   "Moonlit Resonance",
    "Jupiter Pulse",       "Saturn Echo",          "Venus Spark",          "Mercury Forge",
    "Neptune Lullaby",     "Uranus Veil",          "Pluto Song",           "Asteroid Dream",
    "Comet Pulse",         "Solar Flare Whisper",  "Coronal Resonance",    "Heliosphere Song",
    "Interplanetary Veil", "Moonlit Pulse",        "Jovian Dream",         "Saturn Heart",

    # 224–255  Stellar to Quantum Eternity
    "Stellar Drift",       "Nebula Heart",         "Galactic Pulse",       "Cosmic Root",
    "Quasar Whisper",      "Black Hole Lullaby",   "Dark Matter Song",     "Cosmic Microwave",
    "Quantum Foam",        "Void Resonance",       "Star Forge",           "Nebula Veil",
    "Galactic Edge",       "Observable Dream",     "Universal Hum",        "Eternity's Resonance",
    "Photon Veil",         "Neutrino Song",        "Graviton Pulse",       "Singularity Heart",
    "Big Bang Echo",       "Multiverse Whisper",   "Cosmic Horizon",       "Dark Energy Dream",
    "Stellar Nursery",     "Supernova Spark",      "Pulsar Choir",         "Quasar Forge",
    "Black Hole Veil",     "Cosmic Infinity",      "Observable Edge",      "Eternal Resonance",
)
# fmt: on

assert len(BAND_NAMES) == BAND_COUNT


# ── Result type ────────────────────────────────────────────────


class BandResult:
    """Output of a single band-decomposition frame."""

    __slots__ = ("energies", "dominant_index", "dominant_name", "colors")

    def __init__(self, energies, dominant_index, dominant_name, colors):
        self.energies = energies             # float32 array, shape (BAND_COUNT,)
        self.dominant_index = dominant_index  # int
        self.dominant_name = dominant_name    # str
        self.colors = colors                 # float32 array, shape (BAND_COUNT, 3)


# ── BandBank ───────────────────────────────────────────────────


class BandBank:

    def __init__(self, spacing="log"):
        if spacing not in SPACING_MODES:
            raise ValueError(f"spacing must be one of {SPACING_MODES}, got {spacing!r}")
        self.spacing = spacing
        self._low_hz, self._high_hz = _build_band_ranges(spacing)
        self.names = BAND_NAMES
        self.colors = _build_rainbow_colors()

    def compute(self, analysis, samplerate):
        """Decompose an FFT result into 256 band energies.

        Args:
            analysis: AnalysisResult from Analyzer, or None.
            samplerate: audio sample rate in Hz.

        Returns:
            BandResult if analysis is available, else None.
        """
        if analysis is None or samplerate <= 0:
            return None

        energies = _compute_energies(
            analysis.magnitudes_db,
            analysis.num_bins,
            samplerate,
            self._low_hz,
            self._high_hz,
        )

        dominant_index = int(np.argmax(energies))
        dominant_name = self.names[dominant_index]

        return BandResult(
            energies=energies,
            dominant_index=dominant_index,
            dominant_name=dominant_name,
            colors=self.colors,
        )


# ── Scale conversions ─────────────────────────────────────────


def _hz_to_mel(f):
    return 2595.0 * np.log10(1.0 + f / 700.0)


def _mel_to_hz(m):
    return 700.0 * (10.0 ** (m / 2595.0) - 1.0)


def _hz_to_bark(f):
    return (26.81 * f / (1960.0 + f)) - 0.53


def _bark_to_hz(z):
    return 1960.0 * (z + 0.53) / (26.28 - z)


def _hz_to_erb(f):
    """ERB-rate scale (Glasberg & Moore 1990). Cochlear-inspired hybrid."""
    return 21.4 * np.log10(1.0 + 0.00437 * f)


def _erb_to_hz(e):
    return (10.0 ** (e / 21.4) - 1.0) / 0.00437


# ── Band range construction ───────────────────────────────────


def _build_interior_ranges_log(interior_count):
    """Logarithmic spacing in Hz between FLOOR and CEILING."""
    ratio = (CEILING_HZ / FLOOR_HZ) ** (1.0 / interior_count)
    edges = FLOOR_HZ * (ratio ** np.arange(interior_count + 1))
    return edges


def _build_interior_ranges_scale(interior_count, hz_to_scale, scale_to_hz):
    """Linear spacing in a perceptual scale, converted back to Hz."""
    s_floor = hz_to_scale(FLOOR_HZ)
    s_ceil = hz_to_scale(CEILING_HZ)
    edges_scaled = np.linspace(s_floor, s_ceil, interior_count + 1)
    return scale_to_hz(edges_scaled)


def _build_band_ranges(spacing):
    """Build Hz ranges for 256 bands.

    Layout (all modes):
        Band 0:       0 Hz → FLOOR_HZ          (sub-bass floor)
        Bands 1–254:  FLOOR_HZ → CEILING_HZ    (spaced per mode)
        Band 255:     CEILING_HZ → ∞            (capped at Nyquist during compute)
    """
    low_hz = np.zeros(BAND_COUNT, dtype=np.float64)
    high_hz = np.zeros(BAND_COUNT, dtype=np.float64)

    low_hz[0] = 0.0
    high_hz[0] = FLOOR_HZ

    interior = BAND_COUNT - 2

    if spacing == "log":
        edges = _build_interior_ranges_log(interior)
    elif spacing == "mel":
        edges = _build_interior_ranges_scale(interior, _hz_to_mel, _mel_to_hz)
    elif spacing == "bark":
        edges = _build_interior_ranges_scale(interior, _hz_to_bark, _bark_to_hz)
    elif spacing == "hybrid":
        edges = _build_interior_ranges_scale(interior, _hz_to_erb, _erb_to_hz)
    else:
        raise ValueError(f"unknown spacing: {spacing!r}")

    for i in range(interior):
        low_hz[1 + i] = edges[i]
        high_hz[1 + i] = edges[i + 1]

    low_hz[BAND_COUNT - 1] = CEILING_HZ
    high_hz[BAND_COUNT - 1] = np.inf

    return low_hz, high_hz


# ── Energy computation ─────────────────────────────────────────


def _compute_energies(magnitudes_db, num_bins, samplerate, low_hz, high_hz):
    """Map FFT magnitude bins into 256 band energies (0.0–1.0)."""
    nyquist = samplerate * 0.5
    db_range = DB_CEIL - DB_FLOOR
    normalized = np.clip((magnitudes_db - DB_FLOOR) / db_range, 0.0, 1.0)

    energies = np.zeros(BAND_COUNT, dtype=np.float32)

    for i in range(BAND_COUNT):
        lo = low_hz[i]
        hi = min(high_hz[i], nyquist)

        lo_bin = int(lo / nyquist * (num_bins - 1))
        hi_bin = int(np.ceil(hi / nyquist * (num_bins - 1)))

        lo_bin = max(0, min(lo_bin, num_bins - 1))
        hi_bin = max(0, min(hi_bin, num_bins - 1))

        if hi_bin >= lo_bin:
            energies[i] = float(normalized[lo_bin : hi_bin + 1].mean())

    return energies


# ── Color helpers ──────────────────────────────────────────────


def _hsv_to_rgb(h_deg, s, v):
    """Single-value HSV to RGB. h_deg in degrees, s/v in 0–1."""
    h = (h_deg % 360.0) / 60.0
    c = v * s
    x = c * (1.0 - abs(h % 2 - 1.0))
    m = v - c

    if h < 1:    r, g, b = c, x, 0
    elif h < 2:  r, g, b = x, c, 0
    elif h < 3:  r, g, b = 0, c, x
    elif h < 4:  r, g, b = 0, x, c
    elif h < 5:  r, g, b = x, 0, c
    else:        r, g, b = c, 0, x

    return (r + m, g + m, b + m)


def _build_rainbow_colors():
    """Compute one RGB color per band, evenly spaced around the hue wheel."""
    colors = np.zeros((BAND_COUNT, 3), dtype=np.float32)
    for i in range(BAND_COUNT):
        hue = (i / BAND_COUNT) * 360.0
        colors[i] = _hsv_to_rgb(hue, RAINBOW_SATURATION, RAINBOW_VALUE)
    return colors
