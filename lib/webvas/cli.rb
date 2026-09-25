# frozen_string_literal: true

require "fileutils"
require "optparse"
require "socket"
require "uri"

module Webvas
  class CLI
    ROOT = File.expand_path("../..", __dir__)
    CDN = "https://rbgfx.github.io/webvas"
    LIVE_SCRIPT = '(()=>{const s=new EventSource("/__webvas/events");s.onmessage=()=>location.reload()})();'
    CONTENT_TYPES = {
      ".css" => "text/css; charset=utf-8", ".html" => "text/html; charset=utf-8",
      ".js" => "text/javascript; charset=utf-8", ".json" => "application/json",
      ".png" => "image/png", ".svg" => "image/svg+xml", ".wasm" => "application/wasm",
      ".jpg" => "image/jpeg", ".jpeg" => "image/jpeg", ".gif" => "image/gif",
      ".rb" => "text/plain; charset=utf-8", ".txt" => "text/plain; charset=utf-8"
    }.freeze

    def self.run(arguments = ARGV, out: $stdout, err: $stderr)
      command = arguments.shift
      case command
      when "new" then new_project(arguments, out:)
      when "serve" then serve(arguments, out:)
      when "build" then build(arguments, out:)
      when "--help", "-h", nil then out.puts help; 0
      else raise Error, "unknown command: #{command}\n#{help}"
      end
    rescue Error, OptionParser::ParseError, SystemCallError, Interrupt => error
      err.puts(error.message) unless error.is_a?(Interrupt)
      error.is_a?(Interrupt) ? 0 : 1
    end

    def self.help
      <<~HELP
        Usage: webvas <command>

        Commands:
          new NAME             Create a browser sketch project
          serve [--root DIR]   Serve the current project and reload on changes
          build [-o DIR]       Build a static site using the official runtime
               [--runtime custom]  Build a runtime from the project's Gemfile
      HELP
    end

    def self.new_project(arguments, out:)
      name = arguments.shift
      raise Error, "Usage: webvas new NAME" unless name && arguments.empty?
      raise Error, "Project name must be one path component." unless name.match?(/\A[a-zA-Z0-9][a-zA-Z0-9_.-]*\z/) && !%w[. ..].include?(name)

      destination = File.expand_path(name)
      raise Error, "Directory already exists and is not empty: #{destination}" if File.directory?(destination) && !Dir.empty?(destination)
      raise Error, "Path already exists: #{destination}" if File.exist?(destination) && !File.directory?(destination)

      FileUtils.mkdir_p(destination)
      html = project_html.gsub("__WEBVAS_LOADER__", "#{CDN}/loader.js")
        .gsub("__WEBVAS_RUNTIME__", "#{CDN}/assets/webvas.wasm")
      files = {
        "index.html" => html,
        "app.rb" => project_source,
        "Gemfile" => project_gemfile
      }
      existing = files.keys.select { |file| File.exist?(File.join(destination, file)) }
      raise Error, "Refusing to overwrite: #{existing.join(', ')}" unless existing.empty?
      files.each { |file, content| File.write(File.join(destination, file), content) }
      out.puts "Created #{destination}"
      0
    end

    def self.serve(arguments, out:)
      options = { host: "127.0.0.1", port: 8000, root: Dir.pwd }
      OptionParser.new do |parser|
        parser.on("--host HOST") { |value| options[:host] = value }
        parser.on("-p", "--port PORT", Integer) { |value| options[:port] = value }
        parser.on("--root DIR") { |value| options[:root] = value }
      end.parse!(arguments)
      raise Error, "Unexpected arguments: #{arguments.join(' ')}" unless arguments.empty?
      root = File.realpath(options[:root])
      raise Error, "Project root must be a directory: #{root}" unless File.directory?(root)
      raise Error, "Port must be between 0 and 65535." unless (0..65_535).cover?(options[:port])

      server = Server.new(root, host: options[:host], port: options[:port])
      out.puts "Serving #{root} at http://#{options[:host]}:#{server.port}"
      server.start
      0
    ensure
      server&.close
    end

    def self.build(arguments, out:)
      options = { output: "dist", runtime: "official", root: Dir.pwd }
      OptionParser.new do |parser|
        parser.on("-o", "--output DIR") { |value| options[:output] = value }
        parser.on("--runtime RUNTIME") { |value| options[:runtime] = value }
        parser.on("--root DIR") { |value| options[:root] = value }
      end.parse!(arguments)
      raise Error, "Unexpected arguments: #{arguments.join(' ')}" unless arguments.empty?
      raise Error, "Runtime must be official or custom." unless %w[official custom].include?(options[:runtime])

      source = File.realpath(options[:root])
      destination = File.expand_path(options[:output], source)
      ancestor = destination
      suffix = []
      until File.exist?(ancestor) || File.symlink?(ancestor)
        ancestor, name = File.dirname(ancestor), File.basename(ancestor)
        suffix.unshift(name)
      end
      resolved_destination = File.join(File.realpath(ancestor), *suffix)
      raise Error, "Build output cannot overwrite the project." if resolved_destination == source
      if resolved_destination == File.join(source, "assets") || resolved_destination.start_with?(File.join(source, "assets") + File::SEPARATOR)
        raise Error, "Build output cannot be inside the project's assets directory."
      end
      raise Error, "Build output cannot contain the project." if source.start_with?(resolved_destination + File::SEPARATOR)
      raise Error, "Project is missing index.html or app.rb." unless %w[index.html app.rb].all? { |file| File.file?(File.join(source, file)) }

      FileUtils.mkdir_p(destination)
      %w[index.html app.rb].each { |file| FileUtils.cp(File.join(source, file), destination) }
      assets = File.join(source, "assets")
      copy_assets(assets, File.join(destination, "assets")) if File.directory?(assets)
      index = File.read(File.join(destination, "index.html"))
      if options[:runtime] == "custom"
        build_custom_runtime(source, File.join(destination, "assets"))
        webvas_assets = File.join(destination, "assets", "webvas")
        FileUtils.mkdir_p(webvas_assets)
        %w[bridge.js loader.js worker.js].each do |file|
          FileUtils.cp(File.join(ROOT, "js", file), webvas_assets)
        end
        index = index.gsub("__WEBVAS_LOADER__", "./assets/webvas/loader.js")
          .gsub("__WEBVAS_RUNTIME__", "./assets/webvas.wasm")
      else
        index = index.gsub("__WEBVAS_LOADER__", "#{CDN}/loader.js")
          .gsub("__WEBVAS_RUNTIME__", "#{CDN}/assets/webvas.wasm")
      end
      index = index.gsub("<!-- webvas:dev -->", "")
      File.write(File.join(destination, "index.html"), index)
      out.puts "Built #{destination} (#{options[:runtime]} runtime)"
      0
    end

    def self.copy_assets(source, destination)
      FileUtils.mkdir_p(destination)
      Dir.children(source).each do |name|
        path = File.join(source, name)
        next if File.symlink?(path)

        FileUtils.cp_r(path, destination)
      end
    end
    private_class_method :copy_assets

    def self.build_custom_runtime(source, assets)
      gemfile = File.join(source, "Gemfile")
      raise Error, "Custom runtime requires a project Gemfile." unless File.file?(gemfile)
      FileUtils.mkdir_p(assets)
      command = ["bundle", "exec", "rbwasm", "build", "--ruby-version", "4.0",
        "--target", "wasm32-unknown-wasip1", "--build-profile", "full"]
      patch = File.join(ROOT, "patches", "psych-wasi.patch")
      command.concat(["--patch", patch]) if File.file?(patch)
      command.concat(["-o", File.join(assets, "webvas.wasm")])
      success = Dir.chdir(source) { system({ "BUNDLE_GEMFILE" => gemfile }, *command) }
      raise Error, "Custom runtime build failed. Install the project's bundle and check rbwasm." unless success
    end
    private_class_method :build_custom_runtime

    def self.project_html
      <<~HTML
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://rbgfx.github.io https://cdn.jsdelivr.net 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://rbgfx.github.io https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'">
          <title>My Webvas sketch</title>
          <style>body{margin:2rem auto;max-width:760px;padding:0 1rem;background:#101312;color:#e7e9e2;font:16px/1.5 system-ui}canvas{display:block;width:min(100%,640px);height:auto;aspect-ratio:4/3;background:#101827;image-rendering:pixelated}output{display:block;white-space:pre-wrap;overflow-wrap:anywhere}</style>
        </head>
        <body>
          <h1>My Webvas sketch</h1>
          <canvas id="screen" width="320" height="240" aria-label="Ruby sketch"></canvas>
          <script type="text/ruby" data-webvas data-canvas="#screen" src="./app.rb"></script>
          <!-- webvas:dev -->
          <script data-webvas-loader src="__WEBVAS_LOADER__" data-runtime="__WEBVAS_RUNTIME__"></script>
        </body>
        </html>
      HTML
    end
    private_class_method :project_html

    def self.project_source
      <<~RUBY
        require "gesso"

        Gesso.run(width: 320, height: 240, runner: :web, pixelated: true) do
          draw do
            background "#101827"
            no_stroke
            fill "#f07850"
            circle width / 2 + Math.sin(frame_count * 0.05) * 60, height / 2, 28
          end
        end
      RUBY
    end
    private_class_method :project_source

    def self.project_gemfile
      <<~RUBY
        source "https://rubygems.org"

        gem "ruby_wasm", "~> 2.10.1"
        gem "js", "~> 2.10.1"
        gem "webvas", "~> #{Webvas::VERSION}"
        gem "rbgl"
        gem "gesso"
        gem "rlsl"
        gem "glyphic"
      RUBY
    end
    private_class_method :project_gemfile

    class Server
      attr_reader :port

      def initialize(root, host:, port:)
        @root = File.realpath(root)
        @listener = TCPServer.new(host, port)
        @port = @listener.addr[1]
        @threads = []
      end

      def start
        loop do
          socket = @listener.accept
          @threads << Thread.new(socket) { |client| handle(client) }
        end
      rescue IOError, Errno::EBADF
        nil
      end

      def close
        @listener.close unless @listener.closed?
        @threads.each { |thread| thread.kill if thread.alive? }
      end

      private

      def handle(socket)
        request = socket.gets("\r\n", 8192)
        return unless request
        method, target = request.split(" ", 3)
        header_bytes = 0
        while (line = socket.gets("\r\n")) && line != "\r\n"
          header_bytes += line.bytesize
          return response(socket, 400, "text/plain; charset=utf-8", "Headers too large") if header_bytes > 16_384
        end
        return response(socket, 405, "text/plain", "GET only") unless method == "GET"
        return response(socket, 400, "text/plain; charset=utf-8", "Bad request") unless target

        uri = URI.parse(target)
        return events(socket) if uri.path == "/__webvas/events"
        return response(socket, 200, "text/javascript; charset=utf-8", LIVE_SCRIPT) if uri.path == "/__webvas/live.js"

        file = safe_file(uri.path)
        return response(socket, 404, "text/plain; charset=utf-8", "Not found") unless file
        body = File.binread(file)
        if File.basename(file) == "index.html" && body.include?("<!-- webvas:dev -->")
          body = body.sub("<!-- webvas:dev -->", '<script src="/__webvas/live.js"></script>')
        end
        response(socket, 200, CONTENT_TYPES.fetch(File.extname(file), "application/octet-stream"), body)
      rescue URI::InvalidURIError, ArgumentError
        response(socket, 400, "text/plain; charset=utf-8", "Bad request")
      rescue IOError, SystemCallError
        nil
      ensure
        socket.close unless socket.closed?
      end

      def safe_file(path)
        decoded = URI::RFC2396_PARSER.unescape(path)
        return if decoded.include?("\0")
        parts = decoded.split("/")
        return if parts.any? { |part| part.start_with?(".") }
        return if %w[.bundle build dist node_modules tmp vendor].include?(parts.first)
        candidate = File.expand_path(decoded.delete_prefix("/"), @root)
        return unless candidate.start_with?("#{@root}#{File::SEPARATOR}") || candidate == @root

        candidate = File.join(candidate, "index.html") if File.directory?(candidate)
        real = File.realpath(candidate)
        return if real != @root && !real.start_with?("#{@root}#{File::SEPARATOR}")
        return unless File.file?(real)

        real
      rescue Errno::ENOENT, Errno::EACCES
        nil
      end

      def signature
        hidden = %w[.bundle build dist node_modules tmp vendor]
        Dir.glob("**/*", File::FNM_DOTMATCH, base: @root).filter_map do |name|
          next if name == "." || name == ".." || name.split("/").any? { |part| hidden.include?(part) || part.start_with?(".") }
          path = File.join(@root, name)
          stat = File.stat(path) rescue next
          [name, stat.mtime.to_f, stat.size] if stat.file?
        end.sort
      end

      def events(socket)
        previous = signature
        socket.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\nX-Content-Type-Options: nosniff\r\n\r\n: connected\n\n")
        loop do
          sleep 0.5
          current = signature
          if current != previous
            socket.write("data: reload\n\n")
            previous = current
          end
        end
      end

      def response(socket, status, type, body)
        label = { 200 => "OK", 400 => "Bad Request", 404 => "Not Found", 405 => "Method Not Allowed" }.fetch(status)
        socket.write("HTTP/1.1 #{status} #{label}\r\nContent-Type: #{type}\r\nContent-Length: #{body.bytesize}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n")
        socket.write(body)
      end
    end
  end
end
