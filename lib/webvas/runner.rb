# frozen_string_literal: true

module Webvas
  class Scheduler
    def initialize(bridge: Bridge.new)
      @bridge = bridge
    end

    def request_animation_frame(callback)
      @bridge.request_animation_frame(callback)
    end
  end
end
