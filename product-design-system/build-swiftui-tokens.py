#!/usr/bin/env python3
"""Generate AleronDesignTokens.swift from tokens.json. Do not hand-edit the output."""
import argparse, copy, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "AleronDesignTokens.swift"

UNRENDERED = {"font.voice", "font.audit"}

def without(data, path):
    stripped = copy.deepcopy(data)
    node = stripped["tokens"]
    *groups, leaf = path.split(".")
    for group in groups:
        node = node[group]
    del node[leaf]
    return stripped

def check_coverage(data, flat, swift):
    """Every token changes the Swift, or is listed in UNRENDERED above.

    render() dispatches per $type and per group prefix, some of it by hardcoded
    key, so a token it has no case for is dropped without a word. Re-rendering
    without each token is what catches that: matching declaration names instead
    would pass a token whose leaf collides with an unrelated one already emitted
    (radius.tier2 and a hypothetical shadow.tier2 both want `tier2`). A token
    read by hardcoded key raises KeyError once removed, which is also a use.

    The two font tokens are listed: a CSS font stack has no SwiftUI equivalent,
    and AleronTypeface resolves PostScript face names out of font_faces instead.
    """
    missing = []
    for path in flat:
        if path in UNRENDERED:
            continue
        try:
            if render(without(data, path), verify=False) == swift:
                missing.append(path)
        except (KeyError, ValueError, AttributeError, TypeError):
            continue
    if missing:
        raise ValueError(
            f"tokens.json entries that produce no Swift output: {sorted(missing)}. "
            f"Add a case to render(), or list the path in UNRENDERED")

def flatten(node, prefix=()):
    out = {}
    for key, value in node.items():
        path = prefix + (key,)
        if isinstance(value, dict) and "$value" in value:
            out[".".join(path)] = value
        elif isinstance(value, dict):
            out.update(flatten(value, path))
    return out

def camel(name):
    parts = re.split(r"[-.]", name)
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])

def swift_ident(name):
    """Backtick-escape identifiers that start with a digit (2xs, 2xl, 3xl)."""
    return f"`{name}`" if name[:1].isdigit() else name

def resolve(value, flat):
    seen = set()
    while isinstance(value, str) and value.startswith("{") and value.endswith("}"):
        path = value[1:-1]
        if path in seen or path not in flat:
            raise KeyError(f"Unresolvable token alias: {path}")
        seen.add(path)
        value = flat[path]["$value"]
    return value

def swift_color(value):
    """Return a SwiftUI Color expression for a hex or rgba() string."""
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
        r = int(value[1:3], 16) / 255
        g = int(value[3:5], 16) / 255
        b = int(value[5:7], 16) / 255
        return f'Color(red: {r:.4g}, green: {g:.4g}, blue: {b:.4g})'
    m = re.fullmatch(r"rgba\((\d+),(\d+),(\d+),([\d.]+)\)", value)
    if m:
        r, g, b = (int(m.group(i)) / 255 for i in (1, 2, 3))
        a = float(m.group(4))
        return f"Color(red: {r:.4g}, green: {g:.4g}, blue: {b:.4g}, opacity: {a:.4g})"
    raise ValueError(f"Not a color literal: {value}")

def px(value):
    return float(re.fullmatch(r"([\d.]+)px", value).group(1))

def render(data, verify=True):
    flat = flatten(data["tokens"])
    day, night = data["registers"]["day"], data["registers"]["flight-deck"]
    if set(day) != set(night):
        raise ValueError("Register key mismatch between day and flight-deck")

    L = []
    A = L.append
    A("// Generated from tokens.json by build-swiftui-tokens.py. Do not edit directly.")
    A("//")
    A("// Register law for native surfaces: the register is a design decision about what a")
    A("// surface is for, not a user preference and never a dark-mode response. Do NOT map")
    A("// AleronRegister to UITraitCollection.userInterfaceStyle or ColorScheme. A surface")
    A("// chooses its register; the system never chooses it for the member or physician.")
    A("import SwiftUI")
    A("")
    A("public enum AleronRegister: String, CaseIterable {")
    A("    case day = \"day\"")
    A("    case flightDeck = \"flight-deck\"")
    A("}")
    A("")
    A("// MARK: - Primitive palette")
    A("public enum AleronColor {")
    for path, token in flat.items():
        if token["$type"] == "color":
            A(f"    public static let {camel(path.split('.')[-1])} = {swift_color(token['$value'])}")
    A("}")
    A("")
    A("// MARK: - Semantic colors, resolved per register")
    A("public struct AleronSemanticColors {")
    for name in day:
        if name == "shadow-tier1":
            continue
        A(f"    public let {camel(name)}: Color")
    A("")
    A("    public static let day = AleronSemanticColors(")
    A(",\n".join(f"        {camel(n)}: {swift_color(resolve(day[n], flat))}" for n in day if n != "shadow-tier1"))
    A("    )")
    A("    public static let flightDeck = AleronSemanticColors(")
    A(",\n".join(f"        {camel(n)}: {swift_color(resolve(night[n], flat))}" for n in night if n != "shadow-tier1"))
    A("    )")
    A("}")
    A("")
    A("public extension AleronRegister {")
    A("    var colors: AleronSemanticColors { self == .day ? .day : .flightDeck }")
    A("}")
    A("")
    A("// MARK: - Spacing (4px grid), air ladder, radii, layout, layers")
    A("public enum AleronSpace {")
    for name, token in flat.items():
        if name.startswith("space."):
            A(f"    public static let {swift_ident(camel(name.split('.')[-1]))}: CGFloat = {px(token['$value']):g}")
    A("}")
    A("public enum AleronAir {")
    for name, token in flat.items():
        if name.startswith("air."):
            A(f"    /// {token['description']}")
            A(f"    public static let {camel(name.split('.')[-1])}: CGFloat = {px(token['$value']):g}")
    A("}")
    A("public enum AleronRadius {")
    for name, token in flat.items():
        if name.startswith("radius."):
            A(f"    public static let {camel(name.split('.')[-1])}: CGFloat = {px(token['$value']):g}")
    A("}")
    A("public enum AleronLine {")
    for name, token in flat.items():
        if name.startswith("line."):
            A(f"    public static let {camel(name.split('.')[-1])}: CGFloat = {px(token['$value']):g}")
    A("}")
    A("public enum AleronLayout {")
    A(f"    /// Rail rule R1: fixed desktop rail width.")
    A(f"    public static let navWidth: CGFloat = {px(flat['layout.nav']['$value']):g}")
    A(f"    public static let pageMax: CGFloat = {px(flat['layout.pageMax']['$value']):g}")
    A(f"    /// Provisional: below this content width the rail yields to the mobile bar.")
    A(f"    public static let railHinge: CGFloat = {px(flat['layout.railHinge']['$value']):g}")
    A("}")
    A("public enum AleronLayer {")
    A(f"    public static let raised: Double = {float(flat['layer.raised']['$value']):g}")
    A(f"    public static let overlay: Double = {float(flat['layer.overlay']['$value']):g}")
    A("}")
    A("")
    A("// MARK: - Motion")
    A("public enum AleronMotion {")
    for name, token in flat.items():
        if name.startswith("motion.") and token["$type"] == "duration":
            A(f"    public static let {camel(name.split('.')[-1])}: TimeInterval = {float(token['$value'][:-2]) / 1000:g}")
    m = re.fullmatch(r"cubic-bezier\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)", flat["motion.ease"]["$value"])
    A("    public static let easing = Animation.timingCurve(%s, %s, %s, %s)" % m.groups())
    A("}")
    A("")
    A("// MARK: - Type")
    A("public enum AleronTypeface {")
    A("    /// PolySans must be added to the app target and declared under UIAppFonts.")
    A("    public static func name(weight: Int, italic: Bool = false) -> String {")
    A("        switch (weight, italic) {")
    for face in data["font_faces"]:
        if face["family"] != "PolySans":
            continue
        style = face["style"] == "italic"
        A(f"        case ({face['weight']}, {str(style).lower()}): return \"{pathlib.PurePath(face['src']).stem}\"")
    A("        default: return \"PolySans-Neutral\"")
    A("        }")
    A("    }")
    A("    public static func voice(_ size: CGFloat, weight: Int = 400) -> Font { .custom(name(weight: weight), size: size) }")
    A("}")
    A("public enum AleronTypeSize {")
    for name, token in flat.items():
        if name.startswith("size."):
            short = name.split(".")[-1]
            if token["$value"].startswith("clamp("):
                nums = re.findall(r"[\d.]+", token["$value"])
                A(f"    public static let {camel(short)}Min: CGFloat = {nums[0]}")
                A(f"    public static let {camel(short)}Max: CGFloat = {nums[-1]}")
            else:
                A(f"    public static let {camel(short)}: CGFloat = {float(token['$value'].replace('px', '')):g}")
    A("}")
    A("public enum AleronTypeWeight {")
    for name, token in flat.items():
        if token["$type"] == "fontWeight":
            A(f"    public static let {camel(name.split('.')[-1])}: Int = {int(token['$value'])}")
    A("}")
    A("/// Em-relative. Multiply by font size for a SwiftUI .tracking() value.")
    A("public enum AleronTypeTracking {")
    for name, token in flat.items():
        if token["$type"] == "letterSpacing":
            A(f"    public static let {camel(name.split('.')[-1])}: CGFloat = {float(token['$value'][:-2]):g}")
    A("}")
    A("/// Unitless multiple of font size, not a SwiftUI .lineSpacing() gap.")
    A("public enum AleronTypeLineHeight {")
    for name, token in flat.items():
        if token["$type"] == "lineHeight":
            A(f"    public static let {camel(name.split('.')[-1])}: CGFloat = {float(token['$value']):g}")
    A("}")
    A("")
    A("// MARK: - Opacity")
    A("public enum AleronOpacity {")
    for name, token in flat.items():
        if token["$type"] == "opacity":
            A(f"    /// {token['description']}")
            A(f"    public static let {camel(name.split('.')[-1])}: Double = {float(token['$value']):g}")
    A("}")
    A("")
    A("// MARK: - Elevation")
    A("public enum AleronElevation {")
    sh = flat["shadow.tier1"]["$value"]
    m = re.fullmatch(r"0 (\d+)px (\d+)px rgba\((\d+),(\d+),(\d+),([\d.]+)\)", sh)
    A("    /// Day register: the register's only shadow. Flight-deck uses a 1px cream ring at 0.10 instead (see tokens.json registers.shadow-tier1).")
    A(f"    public static let tier1Y: CGFloat = {m.group(1)}")
    A(f"    public static let tier1Blur: CGFloat = {m.group(2)}")
    A(f"    public static let tier1Color = {swift_color('rgba(%s,%s,%s,%s)' % m.groups()[2:])}")
    A("}")
    A("")
    A("// MARK: - Controls")
    A("public enum AleronControl {")
    A(f"    /// Fixed control height floor; also the minimum hit target.")
    A(f"    public static let minHeight: CGFloat = {px(flat['control.minHeight']['$value']):g}")
    A("}")
    swift = "\n".join(L) + "\n"
    if verify:
        check_coverage(data, flat, swift)
    return swift

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = render(json.loads((ROOT / "tokens.json").read_text()))
    if args.check:
        if not OUT.exists() or OUT.read_text() != output:
            print("AleronDesignTokens.swift is stale", file=sys.stderr)
            return 1
        print("AleronDesignTokens.swift matches tokens.json")
        return 0
    OUT.write_text(output)
    print(f"wrote {OUT}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
