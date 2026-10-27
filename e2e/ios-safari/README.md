# iOS Safari learner-flow test (XCUITest)

Drives **real Mobile Safari** in the iOS Simulator with real touches against the live site
(`https://trungnv184.github.io/pronunciation-focus/`). It covers:
- filter by sound → open a video → Play
- Set A/B (proves playback advanced) → 0.75× → Loop
- Record, accepting Safari's own microphone prompt → Compare
- Play again after recording → Mark as done
- the progress page → the "Done" badge on browse

It is not part of `npm test`; run it by hand on a Mac with Xcode:

```bash
brew install xcodegen
cd e2e/ios-safari && xcodegen generate
xcrun simctl list devices available | grep iPhone        # pick a simulator id
xcrun simctl boot <id>
xcrun simctl privacy <id> grant microphone com.apple.mobilesafari
xcodebuild test -project PFUITest.xcodeproj -scheme FlowTests \
  -destination "platform=iOS Simulator,id=<id>" | grep -E "PFLOG|error:|\*\* TEST"
```

Notes:
- Buttons with `aria-pressed` (speed, Loop, Mark as done) are exposed to iOS accessibility as toggles, so the test matches any element type.
- Simulator UI tests time out on a heavily loaded Mac. Run it when `uptime` shows a low load average.
