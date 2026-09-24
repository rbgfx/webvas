# frozen_string_literal: true

require "base64"
require "json"

module Webvas
  class Bridge
    def initialize(api: nil)
      require "js" unless api
      @api = api || JS.global[:WebvasBridge]
    end

    def attach(selector, width, height, pixelated:)
      @api.attach(selector, width, height, pixelated)
    end

    def present(handle, bytes, width, height)
      @api.present(handle, Base64.strict_encode64(bytes), width, height)
    end

    def events(handle)
      JSON.parse(@api.events(handle).to_s)
    end

    def resize(handle, width, height)
      @api.resize(handle, width, height)
    end

    def close(handle)
      @api.close(handle)
    end

    def request_animation_frame(callback)
      JS.global[:window].requestAnimationFrame(callback)
    end

    def show_error(message, backtrace)
      @api.showError(String(message), Array(backtrace).join("\n"))
    end

    def run_shader(canvas, source, layout, uniforms)
      @api.shaderMode(canvas)
      JS.global[:GlazeWGSL].run(canvas, source, layout, uniforms)
    end
  end
end
