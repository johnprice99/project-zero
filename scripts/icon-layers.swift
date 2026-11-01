// Turns the flat icon artwork into Icon Composer layers: the white “P0” as a mask, and
// the tile's purple gradient as colours for icon.json. Run by scripts/icon.mjs.
//
//   swift scripts/icon-layers.swift <light artwork> <dark artwork> <Assets folder>
//
// Writes glyph.png (the white mark) and background-light.png / background-dark.png (the
// tile's diagonal gradient, which icon.json fills can't express), and prints each gradient's
// middle colour as JSON for icon.json's base fill.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

final class Bitmap {
  let width: Int, height: Int
  // The context owns the pixel buffer, so it is kept for as long as the bitmap.
  let context: CGContext
  let pixels: UnsafeMutablePointer<UInt8>
  var bounds = (x: 0, y: 0, w: 0, h: 0)
  init(_ path: String) {
    let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
    width = image.width
    height = image.height
    context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    // A bitmap context's first row is the top of the image.
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    pixels = context.data!.bindMemory(to: UInt8.self, capacity: width * height * 4)
    bounds = tile()
  }
  func pixel(_ x: Int, _ y: Int) -> (r: Double, g: Double, b: Double, a: Double) {
    let i = (y * width + x) * 4
    return (Double(pixels[i]) / 255, Double(pixels[i + 1]) / 255, Double(pixels[i + 2]) / 255, Double(pixels[i + 3]) / 255)
  }
  // The rounded tile: everything clearly opaque.
  func tile() -> (x: Int, y: Int, w: Int, h: Int) {
    var minX = width, maxX = 0, minY = height, maxY = 0
    for y in 0..<height { for x in 0..<width where pixel(x, y).a > 0.5 {
      minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
    } }
    return (minX, minY, maxX - minX + 1, maxY - minY + 1)
  }
  // Average colour of the background near a point (as fractions of the tile), skipping the white glyph.
  func background(at fx: Double, _ fy: Double) -> (Double, Double, Double) {
    let t = bounds
    var sum = (0.0, 0.0, 0.0), n = 0.0
    let cx = t.x + Int(Double(t.w) * fx), cy = t.y + Int(Double(t.h) * fy)
    for y in (cy - 12)...(cy + 12) { for x in (cx - 12)...(cx + 12) {
      let p = pixel(x, y)
      if p.a > 0.99 && min(p.r, p.g, p.b) < 0.6 { sum = (sum.0 + p.r, sum.1 + p.g, sum.2 + p.b); n += 1 }
    } }
    return (sum.0 / n, sum.1 / n, sum.2 / n)
  }
}

let args = CommandLine.arguments
let light = Bitmap(args[1]), dark = Bitmap(args[2])

// The glyph, scaled evenly so the tile's width fills the 1024 canvas (macOS applies its own
// icon shape), and centred. Coverage comes from whiteness: the glyph is white, while even the
// gradient's palest pink has a channel well below it.
let t = light.bounds
let mask = UnsafeMutablePointer<UInt8>.allocate(capacity: t.w * t.h * 4)
for y in 0..<t.h { for x in 0..<t.w {
  let p = light.pixel(t.x + x, t.y + y)
  let coverage = p.a < 0.99 ? 0 : max(0, min(1, (min(p.r, p.g, p.b) - 0.5) / 0.45))
  let i = (y * t.w + x) * 4
  let a = UInt8((coverage * 255).rounded())
  (mask[i], mask[i + 1], mask[i + 2], mask[i + 3]) = (a, a, a, a)  // premultiplied white
} }
let size = 1024
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
let source = CGContext(data: mask, width: t.w, height: t.h, bitsPerComponent: 8, bytesPerRow: t.w * 4, space: sRGB,
                       bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let glyph = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: sRGB,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
glyph.interpolationQuality = .high
let scale = Double(size) / Double(t.w)
let height = Double(t.h) * scale
glyph.draw(source.makeImage()!, in: CGRect(x: 0, y: (Double(size) - height) / 2, width: Double(size), height: height))

func write(_ image: CGImage, _ name: String) {
  let url = URL(fileURLWithPath: args[3]).appendingPathComponent(name)
  let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, image, nil)
  CGImageDestinationFinalize(destination)
}
write(glyph.makeImage()!, "glyph.png")

// The tile's gradient runs from the top-left corner to the bottom-right.
// Returns the colour midway along it, for icon.json's base fill.
func gradient(_ artwork: Bitmap, _ name: String) -> String {
  let stops = [artwork.background(at: 0.08, 0.08), artwork.background(at: 0.92, 0.92)]
  let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: sRGB,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  let colours = stops.map { CGColor(colorSpace: sRGB, components: [CGFloat($0.0), CGFloat($0.1), CGFloat($0.2), 1])! }
  let fill = CGGradient(colorsSpace: sRGB, colors: colours as CFArray, locations: [0, 1])!
  // Bitmap coordinates start at the bottom-left, so the top-left is (0, size).
  context.drawLinearGradient(fill, start: CGPoint(x: 0, y: size), end: CGPoint(x: size, y: 0),
                             options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
  write(context.makeImage()!, name)
  let (a, b) = (stops[0], stops[1])
  return String(format: "extended-srgb:%.5f,%.5f,%.5f,1.00000", (a.0 + b.0) / 2, (a.1 + b.1) / 2, (a.2 + b.2) / 2)
}
let colours = ["light": gradient(light, "background-light.png"), "dark": gradient(dark, "background-dark.png")]
print(String(data: try! JSONSerialization.data(withJSONObject: colours), encoding: .utf8)!)
