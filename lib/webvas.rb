# frozen_string_literal: true

require_relative "webvas/version"
require "rbgl"
require_relative "webvas/bridge"
require_relative "webvas/backend"
require_relative "webvas/input"
require_relative "webvas/key_map"
require_relative "webvas/runner"

module Webvas
  class Error < StandardError; end

  def self.run(window, scheduler: nil, on_error: nil, &frame_callback)
    raise ArgumentError, "a frame callback is required" unless frame_callback

    scheduler ||= Scheduler.new
    callback = nil
    callback = proc do |timestamp|
      begin
        if !window.should_close? && window.step(Float(timestamp) / 1000, &frame_callback) && !window.should_close?
          scheduler.request_animation_frame(callback)
        else
          window.close
        end
      rescue StandardError => error
        window.close
        (on_error || method(:report_error)).call(error)
      end
    end
    scheduler.request_animation_frame(callback)
    callback
  end

  def self.report_error(error)
    Bridge.new.show_error(error.message, error.backtrace || [])
  end

end
