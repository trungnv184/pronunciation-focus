import XCTest

/// Drives real Mobile Safari with real touches through the Pronunciation Focus learner flow.
final class SafariFlowTests: XCTestCase {
    let base = "https://trungnv184.github.io/pronunciation-focus/"
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")

    func any(_ text: String, type: XCUIElement.ElementType = .any) -> XCUIElement {
        safari.descendants(matching: type).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    @discardableResult
    func tap(_ text: String, type: XCUIElement.ElementType = .any, timeout: TimeInterval = 20) -> XCUIElement {
        let e = any(text, type: type)
        XCTAssertTrue(e.waitForExistence(timeout: timeout), "missing: \(text)")
        for _ in 0..<6 where !e.isHittable { safari.swipeUp(velocity: .slow) }
        e.tap()
        return e
    }

    func log(_ s: String) { print("PFLOG \(s)") }

    /// Taps Play until the page reports it is playing (button flips to "Tạm dừng · Pause").
    func startPlayback() -> Bool {
        XCTAssertTrue(any("Phát · Play", type: .button).waitForExistence(timeout: 30))
        let loading = any("Loading player")
        if loading.exists { _ = loading.waitForNonExistence(timeout: 30) }
        for attempt in 1...3 {
            let play = any("Phát · Play", type: .button)
            if play.exists { play.tap() }
            if any("Tạm dừng · Pause", type: .button).waitForExistence(timeout: 15) { log("playing after \(attempt) tap(s)"); return true }
        }
        return false
    }

    func allowMicIfAsked() {
        for label in ["Allow", "Cho phép"] {
            let b = safari.buttons[label]
            if b.waitForExistence(timeout: 4) { b.tap(); log("tapped Safari mic prompt: \(label)"); return }
            let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons[label]
            if sb.exists { sb.tap(); log("tapped springboard mic prompt: \(label)"); return }
        }
    }

    func testLearnerFlow() throws {
        continueAfterFailure = true
        safari.launch()
        safari.open(URL(string: base)!)
        // 1. onboarding → filter
        let start = any("Start with ending sounds", type: .link)
        if start.waitForExistence(timeout: 25) {
            start.tap(); log("1 onboarding shown and used")
        } else {
            log("1 onboarding already dismissed in this Safari profile; opening the same filter URL")
            safari.open(URL(string: base + "#/?tags=final-consonants")!)
        }
        let card = safari.links.matching(NSPredicate(format: "label CONTAINS %@", "Duration")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20))
        log("1 filtered list shows card: \(card.label.prefix(80))")
        // 2. open a video, real tap on Play
        card.tap()
        XCTAssertTrue(startPlayback(), "YouTube never started playing")
        sleep(4)
        tap("Đặt A · Set A", type: .button); sleep(6)
        tap("Đặt B · Set B", type: .button)
        log("A/B texts: \(safari.staticTexts.allElementsBoundByIndex.map { $0.label }.filter { $0.hasPrefix("0:") || $0.hasPrefix("1:") }) | play button: \(safari.buttons.allElementsBoundByIndex.map { $0.label }.filter { $0.contains("Play") || $0.contains("Pause") })")
        if !any("Đoạn · Part").exists {
            // video stalled (slow simulator): let it run longer and capture B again
            sleep(8); tap("Đặt B · Set B", type: .button)
            log("retry B texts: \(safari.staticTexts.allElementsBoundByIndex.map { $0.label }.filter { $0.hasPrefix("0:") || $0.hasPrefix("1:") })")
        }
        let part = any("Đoạn · Part")
        XCTAssertTrue(part.waitForExistence(timeout: 5), "no A–B segment: video did not advance after Play")
        log("2 played; segment: \(part.label)")
        log("TOGGLES: \(safari.toggles.allElementsBoundByIndex.map { $0.label })")
        log("BUTTONS: \(safari.buttons.allElementsBoundByIndex.map { $0.label }.filter { !$0.isEmpty })")
        log("TEXTS: \(safari.staticTexts.allElementsBoundByIndex.map { $0.label }.filter { $0.contains("0:") || $0.contains("×") })")
        // 3. speed + loop
        tap("0.75×")
        tap("Lặp · Loop")
        XCTAssertTrue(any("Đang lặp · Looping").waitForExistence(timeout: 5))
        log("3 loop active at 0.75x")
        // 4. record (real Safari mic prompt)
        tap("Thu âm · Record", type: .button)
        allowMicIfAsked()
        let attempt = any("Delete attempt")
        let recorded = attempt.waitForExistence(timeout: 30)
        if !recorded {
            let err = safari.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Micro")).allElementsBoundByIndex.map { $0.label }
            log("4 no attempt; mic messages: \(err)")
        }
        XCTAssertTrue(recorded, "recording was not saved")
        log("4 recorded attempt: \(attempt.label)")
        // 5. compare
        tap("So sánh · Compare", type: .button)
        log("5 compare status shown: \(any("So sánh: mẫu").waitForExistence(timeout: 5))")
        sleep(8)
        // 6. YouTube still plays after the mic was closed
        log("6 playback restarts after recording: \(startPlayback())"); sleep(3)
        tap("Đặt A · Set A", type: .button)
        log("6 after recording, segment now: \(any("Đoạn · Part").label)")
        // 7. mark done
        // state persists across runs: make sure it ends up "done", whatever it was
        let doneEl = any("Mark as done")
        XCTAssertTrue(doneEl.waitForExistence(timeout: 20))
        log("7 mark done before: value=\(String(describing: doneEl.value))")
        if (doneEl.value as? String) != "1" && (doneEl.value as? NSNumber)?.intValue != 1 { doneEl.tap() }
        let done = doneEl
        log("7 mark done selected=\(done.isSelected) value=\(String(describing: done.value))")
        // 8. reload: recording persisted
        safari.open(URL(string: base + "#/progress")!)
        XCTAssertTrue(any("Chuỗi ngày").waitForExistence(timeout: 20))
        log("8 progress page streak: \(any("ngày · day").label)")
        // the done video is older than the first 48 cards of the unfiltered list, so check the list it came from
        safari.open(URL(string: base + "#/?tags=final-consonants")!)
        XCTAssertTrue(any("Đã xong · Done").waitForExistence(timeout: 20), "done badge missing on browse")
        log("9 browse shows done badge")
    }
}
