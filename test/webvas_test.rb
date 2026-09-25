# frozen_string_literal: true

require_relative "test_helper"

class WebvasTest < Test::Unit::TestCase
  class FakeBridge
    attr_reader :calls

    def initialize
      @calls = []
    end

    def attach(*args, **options)
      @calls << [:attach, args, options]
      7
    end

    def present(handle, bytes, width, height)
      @calls << [:present, handle, Base64.strict_encode64(bytes), width, height]
      true
    end

    def events(_handle)
      [{ "type" => "pointerdown", "clientX" => 50, "clientY" => 25,
         "left" => 0, "top" => 0, "rectWidth" => 100, "rectHeight" => 50,
         "button" => 0, "shiftKey" => true }]
    end

    def resize(*args) = @calls << [:resize, *args]
    def close(handle) = @calls << [:close, handle]
  end

  class FakeAPI
    attr_reader :calls

    def initialize = (@calls = [])

    def attach(*args) = (@calls << [:attach, *args]; 4)
    def present(*args) = (@calls << [:present, *args]; true)
    def events(_handle) = '[{"type":"wheel","deltaY":2}]'
    def resize(*args) = (@calls << [:resize, *args]; true)
    def close(*args) = @calls << [:close, *args]
    def showError(*args) = @calls << [:showError, *args]
  end

  class FakeWindow
    attr_reader :steps, :closed

    def initialize(results: [true])
      @results = results
      @steps = []
      @closed = false
    end

    def should_close? = @closed
    def step(now, &callback)
      @steps << now
      callback.call(:context, 0.016)
      @results.shift || false
    end
    def close = (@closed = true)
  end

  class FakeScheduler
    attr_reader :callbacks

    def initialize = (@callbacks = [])
    def request_animation_frame(callback) = @callbacks << callback
  end

  def test_browser_events_are_scaled_and_translated
    event = Webvas::Input.translate(FakeBridge.new.events(7), width: 400, height: 200).first

    assert_equal :mouse_press, event.type
    assert_equal 200, event[:x]
    assert_equal 100, event[:y]
    assert_equal 1, event[:button]
    assert_equal [:shift], event[:modifiers]
  end

  def test_input_translates_keyboard_wheel_and_ignores_unknown_events
    events = [
      { "type" => "keydown", "code" => "KeyA", "key" => "A", "ctrlKey" => true },
      { "type" => "wheel", "deltaX" => 1, "deltaY" => -2 },
      { "type" => "unknown" }
    ]
    translated = Webvas::Input.translate(events, width: 2, height: 2)

    assert_equal [:key_press, :scroll], translated.map(&:type)
    assert_equal :a, translated.first[:key]
    assert_equal [:control], translated.first[:modifiers]
    assert_equal(-2, translated.last[:dy])
  end

  def test_pointer_coordinates_handle_hidden_canvas_and_clamp_edges
    hidden = { "clientX" => 1, "clientY" => 1, "left" => 0, "top" => 0, "rectWidth" => 0, "rectHeight" => 0 }
    outside = hidden.merge("rectWidth" => 10, "rectHeight" => 10, "clientX" => 12, "clientY" => -2)

    assert_equal [0, 0], Webvas::Input.coordinates(hidden, width: 4, height: 3)
    assert_equal [3, 0], Webvas::Input.coordinates(outside, width: 4, height: 3)
    assert_raise(ArgumentError) { Webvas::Input.coordinates(hidden, width: 0, height: 3) }
  end

  def test_backend_queues_rgba_pixels_until_window_presents
    bridge = FakeBridge.new
    backend = Webvas::Backend.new(width: 2, height: 1, bridge: bridge)
    pixels = "\x01\x02\x03\xff".b * 2

    assert_true backend.set_pixels(pixels, 2, 1)
    backend.present(Object.new)
    assert_equal pixels, Base64.decode64(bridge.calls.last[2])
    backend.resize(3, 1)
    assert_equal [:resize, 7, 3, 1], bridge.calls.last
    backend.close
    assert_true backend.should_close?
    assert_equal [:close, 7], bridge.calls.last
    assert_raise(ArgumentError) { backend.resize(0, 1) }
    assert_raise(ArgumentError) { backend.set_pixels("short", 2, 1) }
  end

  def test_bridge_encodes_frames_and_decodes_events
    api = FakeAPI.new
    bridge = Webvas::Bridge.new(api:)

    assert_equal 4, bridge.attach("#screen", 2, 3, pixelated: true)
    assert_true bridge.present(4, "\x00\xff".b, 1, 1)
    assert_equal [{ "type" => "wheel", "deltaY" => 2 }], bridge.events(4)
    bridge.show_error("bad", ["line 1", "line 2"])
    assert_equal [:showError, "bad", "line 1\nline 2"], api.calls.last
  end

  def test_scheduler_reuses_one_animation_callback
    window = FakeWindow.new(results: [true, false])
    scheduler = FakeScheduler.new
    callback = Webvas.run(window, scheduler:) { |_context, _delta| nil }

    assert_same callback, scheduler.callbacks.first
    callback.call(1000)
    assert_same callback, scheduler.callbacks.last
    callback.call(1016)
    assert_true window.closed
    assert_equal [1.0, 1.016], window.steps
  end

  def test_scheduler_reports_errors_and_closes_window
    window = FakeWindow.new
    scheduler = FakeScheduler.new
    errors = []
    Webvas.run(window, scheduler:, on_error: ->(error) { errors << error.message }) { raise "frame failed" }

    scheduler.callbacks.first.call(0)
    assert_true window.closed
    assert_equal ["frame failed"], errors
    assert_equal 1, scheduler.callbacks.length
  end

  def test_keyboard_mapping_handles_letters_digits_and_unknowns
    assert_equal :a, Webvas::KeyMap.call("KeyA", "a")
    assert_equal :seven, Webvas::KeyMap.call("Digit7", "7")
    assert_equal :f12, Webvas::KeyMap.call("F12")
    assert_equal :unidentified, Webvas::KeyMap.call("Unidentified", "")
  end
end
