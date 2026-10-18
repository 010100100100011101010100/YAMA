// Creates an authored visual reconstruction, never a purported original recording.
import AppKit
import AVFoundation

let destination = URL(fileURLWithPath: CommandLine.arguments[1])
let width = 960, height = 540
let writer = try AVAssetWriter(outputURL: destination, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
for frame in 0..<60 {
    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
    var pixelBuffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pixelBuffer)
    let buffer = pixelBuffer!
    CVPixelBufferLockBaseAddress(buffer, [])
    let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    context.setFillColor(CGColor(red: 0.07, green: 0.10, blue: 0.08, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
    func label(_ value: String, _ y: CGFloat, _ size: CGFloat, _ color: NSColor = .white) {
        (value as NSString).draw(at: NSPoint(x: 64, y: y), withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: .medium), .foregroundColor: color])
    }
    label("Delivery status", 435, 38)
    label("Label created", 345, 28, NSColor(red: 0.65, green: 0.87, blue: 0.69, alpha: 1))
    label("Waiting for courier pickup", 292, 24)
    label("No parcel handover is recorded.", 245, 24)
    for index in 0..<3 {
        context.setFillColor(CGColor(red: 0.58, green: 0.76, blue: 0.61, alpha: (frame / 6) % 3 == index ? 1 : 0.3))
        context.fillEllipse(in: CGRect(x: 65 + index * 23, y: 186, width: 11, height: 11))
    }
    label("Tracking screen described in the report", 105, 20, .lightGray)
    label("Visual reconstruction", 70, 18, .lightGray)
    NSGraphicsContext.restoreGraphicsState()
    CVPixelBufferUnlockBaseAddress(buffer, [])
    guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: 12)) else { throw writer.error! }
}
input.markAsFinished()
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()
guard writer.status == .completed else { throw writer.error! }
print("Created 5-second H.264 tracking reconstruction.")
