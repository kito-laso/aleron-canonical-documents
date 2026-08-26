// Generated from tokens.json by build-swiftui-tokens.py. Do not edit directly.
//
// Register law for native surfaces: the register is a design decision about what a
// surface is for, not a user preference and never a dark-mode response. Do NOT map
// AleronRegister to UITraitCollection.userInterfaceStyle or ColorScheme. A surface
// chooses its register; the system never chooses it for the member or physician.
import SwiftUI

public enum AleronRegister: String, CaseIterable {
    case day = "day"
    case flightDeck = "flight-deck"
}

// MARK: - Primitive palette
public enum AleronColor {
    public static let paper = Color(red: 0.9804, green: 0.9686, blue: 0.949)
    public static let ink = Color(red: 0.1137, green: 0.1059, blue: 0.09412)
    public static let cream = Color(red: 0.9608, green: 0.9451, blue: 0.9098)
    public static let graphite = Color(red: 0.08235, green: 0.0902, blue: 0.1098)
    public static let gunmetal = Color(red: 0.2, green: 0.2431, blue: 0.2824)
    public static let steel = Color(red: 0.2745, green: 0.3333, blue: 0.3725)
    public static let navy = Color(red: 0.1451, green: 0.1686, blue: 0.2392)
    public static let slate = Color(red: 0.3529, green: 0.3882, blue: 0.4706)
    public static let gold = Color(red: 0.7882, green: 0.6314, blue: 0.3059)
    public static let litGold = Color(red: 0.9176, green: 0.7961, blue: 0.498)
    public static let textGold = Color(red: 0.5412, green: 0.4157, blue: 0.1843)
    public static let gold800 = Color(red: 0.3961, green: 0.3176, blue: 0.1529)
    public static let ember = Color(red: 0.6431, green: 0.2706, blue: 0.1725)
    public static let unmodeled = Color(red: 0.2902, green: 0.4353, blue: 0.6471)
    public static let dayTertiary = Color(red: 0.4314, green: 0.4157, blue: 0.3882)
    public static let dayCard = Color(red: 1, green: 1, blue: 1)
    public static let dayInset = Color(red: 0.9451, green: 0.9294, blue: 0.902)
    public static let nightInset = Color(red: 0.1255, green: 0.1451, blue: 0.2275)
    public static let nightSunken = Color(red: 0.1098, green: 0.1255, blue: 0.1882)
}

// MARK: - Semantic colors, resolved per register
public struct AleronSemanticColors {
    public let ground: Color
    public let textPrimary: Color
    public let textSecondary: Color
    public let textTertiary: Color
    public let surfaceCard: Color
    public let surfaceInset: Color
    public let surfaceSunken: Color
    public let surfaceSelected: Color
    public let surfaceTier1: Color
    public let surfaceTier2: Color
    public let borderSubtle: Color
    public let borderBase: Color
    public let borderStrong: Color
    public let hairline: Color
    public let signalForward: Color
    public let signalAdvisory: Color
    public let signalHazard: Color
    public let signalBaseline: Color
    public let controlPrimaryBg: Color
    public let controlPrimaryFg: Color
    public let controlPrimaryHoverBg: Color
    public let controlSecondaryHoverBorder: Color
    public let controlTertiaryHoverFg: Color
    public let controlDisabledBg: Color
    public let controlDisabledFg: Color
    public let scrim: Color

    public static let day = AleronSemanticColors(
        ground: Color(red: 0.9804, green: 0.9686, blue: 0.949),
        textPrimary: Color(red: 0.1137, green: 0.1059, blue: 0.09412),
        textSecondary: Color(red: 0.3529, green: 0.3882, blue: 0.4706),
        textTertiary: Color(red: 0.4314, green: 0.4157, blue: 0.3882),
        surfaceCard: Color(red: 1, green: 1, blue: 1),
        surfaceInset: Color(red: 0.9451, green: 0.9294, blue: 0.902),
        surfaceSunken: Color(red: 0.9608, green: 0.9451, blue: 0.9098),
        surfaceSelected: Color(red: 0.9451, green: 0.9294, blue: 0.902),
        surfaceTier1: Color(red: 1, green: 1, blue: 1),
        surfaceTier2: Color(red: 0.9451, green: 0.9294, blue: 0.902),
        borderSubtle: Color(red: 0.1137, green: 0.1059, blue: 0.09412, opacity: 0.1),
        borderBase: Color(red: 0.1137, green: 0.1059, blue: 0.09412, opacity: 0.18),
        borderStrong: Color(red: 0.1137, green: 0.1059, blue: 0.09412, opacity: 0.35),
        hairline: Color(red: 0.1137, green: 0.1059, blue: 0.09412, opacity: 0.07),
        signalForward: Color(red: 0.7882, green: 0.6314, blue: 0.3059),
        signalAdvisory: Color(red: 0.5412, green: 0.4157, blue: 0.1843),
        signalHazard: Color(red: 0.6431, green: 0.2706, blue: 0.1725),
        signalBaseline: Color(red: 0.3529, green: 0.3882, blue: 0.4706),
        controlPrimaryBg: Color(red: 0.1137, green: 0.1059, blue: 0.09412),
        controlPrimaryFg: Color(red: 0.9608, green: 0.9451, blue: 0.9098),
        controlPrimaryHoverBg: Color(red: 0, green: 0, blue: 0),
        controlSecondaryHoverBorder: Color(red: 0.1137, green: 0.1059, blue: 0.09412),
        controlTertiaryHoverFg: Color(red: 0.1137, green: 0.1059, blue: 0.09412),
        controlDisabledBg: Color(red: 0.9451, green: 0.9294, blue: 0.902),
        controlDisabledFg: Color(red: 0.1137, green: 0.1059, blue: 0.09412, opacity: 0.38),
        scrim: Color(red: 0.1137, green: 0.1059, blue: 0.09412, opacity: 0.28)
    )
    public static let flightDeck = AleronSemanticColors(
        ground: Color(red: 0.1451, green: 0.1686, blue: 0.2392),
        textPrimary: Color(red: 0.9608, green: 0.9451, blue: 0.9098),
        textSecondary: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.68),
        textTertiary: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.55),
        surfaceCard: Color(red: 0.2, green: 0.2431, blue: 0.2824),
        surfaceInset: Color(red: 0.1255, green: 0.1451, blue: 0.2275),
        surfaceSunken: Color(red: 0.1098, green: 0.1255, blue: 0.1882),
        surfaceSelected: Color(red: 0.2, green: 0.2431, blue: 0.2824),
        surfaceTier1: Color(red: 0.2, green: 0.2431, blue: 0.2824),
        surfaceTier2: Color(red: 0.1255, green: 0.1451, blue: 0.2275),
        borderSubtle: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.08),
        borderBase: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.14),
        borderStrong: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.25),
        hairline: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.09),
        signalForward: Color(red: 0.7882, green: 0.6314, blue: 0.3059),
        signalAdvisory: Color(red: 0.9176, green: 0.7961, blue: 0.498),
        signalHazard: Color(red: 0.6431, green: 0.2706, blue: 0.1725),
        signalBaseline: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.68),
        controlPrimaryBg: Color(red: 0.9608, green: 0.9451, blue: 0.9098),
        controlPrimaryFg: Color(red: 0.1137, green: 0.1059, blue: 0.09412),
        controlPrimaryHoverBg: Color(red: 1, green: 1, blue: 1),
        controlSecondaryHoverBorder: Color(red: 0.9608, green: 0.9451, blue: 0.9098),
        controlTertiaryHoverFg: Color(red: 0.9608, green: 0.9451, blue: 0.9098),
        controlDisabledBg: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.12),
        controlDisabledFg: Color(red: 0.9608, green: 0.9451, blue: 0.9098, opacity: 0.3),
        scrim: Color(red: 0, green: 0, blue: 0, opacity: 0.48)
    )
}

public extension AleronRegister {
    var colors: AleronSemanticColors { self == .day ? .day : .flightDeck }
}

// MARK: - Spacing (4px grid), air ladder, radii, layout, layers
public enum AleronSpace {
    public static let `2xs`: CGFloat = 4
    public static let xs: CGFloat = 8
    public static let sm: CGFloat = 12
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 24
    public static let xl: CGFloat = 32
    public static let `2xl`: CGFloat = 48
    public static let `3xl`: CGFloat = 64
}
public enum AleronAir {
    /// Within a group
    public static let row: CGFloat = 9
    /// Into a new group
    public static let group: CGFloat = 26
    /// Between sibling blocks
    public static let tier: CGFloat = 20
    /// Into a new section
    public static let section: CGFloat = 44
}
public enum AleronRadius {
    public static let panel: CGFloat = 18
    public static let tier1: CGFloat = 16
    public static let tier2: CGFloat = 12
    public static let control: CGFloat = 10
    public static let tile: CGFloat = 4
}
public enum AleronLayout {
    /// Rail rule R1: fixed desktop rail width.
    public static let navWidth: CGFloat = 188
    public static let pageMax: CGFloat = 1240
    /// Provisional: below this content width the rail yields to the mobile bar.
    public static let railHinge: CGFloat = 760
}
public enum AleronLayer {
    public static let raised: Double = 100
    public static let overlay: Double = 200
}

// MARK: - Motion
public enum AleronMotion {
    public static let fast: TimeInterval = 0.15
    public static let base: TimeInterval = 0.24
    public static let slow: TimeInterval = 0.4
    public static let easing = Animation.timingCurve(0.4, 0, 0.2, 1)
}

// MARK: - Type
public enum AleronTypeface {
    /// PolySans must be added to the app target and declared under UIAppFonts.
    public static func name(weight: Int, italic: Bool = false) -> String {
        switch (weight, italic) {
        case (300, false): return "PolySans-Slim"
        case (400, false): return "PolySans-Neutral"
        case (400, true): return "PolySans-NeutralItalic"
        case (500, false): return "PolySans-Median"
        case (500, true): return "PolySans-MedianItalic"
        case (700, false): return "PolySans-Bulky"
        default: return "PolySans-Neutral"
        }
    }
    public static func voice(_ size: CGFloat, weight: Int = 400) -> Font { .custom(name(weight: weight), size: size) }
}
public enum AleronTypeSize {
    public static let displayMin: CGFloat = 32
    public static let displayMax: CGFloat = 48
    public static let h1: CGFloat = 36
    public static let h2: CGFloat = 26
    public static let h3: CGFloat = 19
    public static let lede: CGFloat = 18
    public static let text: CGFloat = 15.5
    public static let small: CGFloat = 13
    public static let audit: CGFloat = 11.5
    public static let caption: CGFloat = 10.5
}

// MARK: - Elevation
public enum AleronElevation {
    /// Day register: the register's only shadow. Flight-deck uses a 1px cream ring at 0.10 instead (see tokens.json registers.shadow-tier1).
    public static let tier1Y: CGFloat = 12
    public static let tier1Blur: CGFloat = 36
    public static let tier1Color = Color(red: 0.1137, green: 0.1059, blue: 0.09412, opacity: 0.09)
}

// MARK: - Controls
public enum AleronControl {
    /// Fixed control height floor; also the minimum hit target.
    public static let minHeight: CGFloat = 44
}
