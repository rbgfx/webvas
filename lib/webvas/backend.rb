# frozen_string_literal: true

module Webvas
  class Backend < RBGL::GUI::Backend
    def initialize(width:, height:, canvas: "#screen", title: "Webvas", pixelated: false, bridge: Bridge.new)
      super(width, height, title)
      @bridge = bridge
      @handle = @bridge.attach(canvas, width, height, pixelated:)
      @pending_pixels = nil
      @closed = false
    end

    def present(framebuffer)
      bytes, width, height = @pending_pixels || [framebuffer.to_rgba_bytes, framebuffer.width, framebuffer.height]
      @pending_pixels = nil
      @bridge.present(@handle, bytes, width, height)
    end

    def set_pixels(buffer, width, height)
      width = Integer(width)
      height = Integer(height)
      bytes = validate_rgba_buffer(buffer, width, height)
      resize(width, height) if [width, height] != [@width, @height]
      @pending_pixels = [bytes, width, height]
      true
    end

    def resize(width, height)
      width = Integer(width)
      height = Integer(height)
      raise ArgumentError, "canvas size must be positive" unless width.positive? && height.positive?

      super
      @bridge.resize(@handle, width, height)
    end

    def poll_events
      Input.translate(@bridge.events(@handle), width: @width, height: @height)
    end

    def poll_events_raw
      poll_events.map(&:to_h)
    end

    def should_close?
      @closed
    end

    def close
      return if @closed

      @closed = true
      @bridge.close(@handle)
    end
  end
end
