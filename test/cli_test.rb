# frozen_string_literal: true

require_relative "test_helper"
require_relative "../lib/webvas/cli"
require "stringio"
require "tmpdir"
require "socket"
require "timeout"

class WebvasCliTest < Test::Unit::TestCase
  def test_help_and_unknown_command
    output = StringIO.new
    error = StringIO.new
    assert_equal 0, Webvas::CLI.run(["--help"], out: output, err: error)
    assert_include output.string, "serve [--root DIR]"
    assert_equal 1, Webvas::CLI.run(["unknown"], out: StringIO.new, err: error)
    assert_include error.string, "unknown command"
  end

  def test_new_creates_a_sketch_that_uses_the_official_runtime
    Dir.mktmpdir do |directory|
      Dir.chdir(directory) do
        assert_equal 0, Webvas::CLI.run(["new", "demo"], out: StringIO.new, err: StringIO.new)
        assert_true File.file?("demo/app.rb")
        assert_include File.read("demo/index.html"), "https://rbgfx.github.io/webvas/loader.js"
        assert_include File.read("demo/Gemfile"), 'gem "gesso"'
        assert_equal 1, Webvas::CLI.run(["new", "demo"], out: StringIO.new, err: StringIO.new)
      end
    end
  end

  def test_build_copies_assets_and_rewrites_the_loader_urls
    Dir.mktmpdir do |directory|
      source = File.join(directory, "project")
      FileUtils.mkdir_p(File.join(source, "assets"))
      File.write(File.join(source, "index.html"), '<script src="__WEBVAS_LOADER__" data-runtime="__WEBVAS_RUNTIME__"></script><!-- webvas:dev -->')
      File.write(File.join(source, "app.rb"), "puts :ready")
      File.write(File.join(source, "assets", "image.bin"), "asset")
      output = StringIO.new

      assert_equal 0, Webvas::CLI.run(["build", "--root", source, "-o", "site"], out: output, err: StringIO.new)
      html = File.read(File.join(source, "site", "index.html"))
      assert_include html, "https://rbgfx.github.io/webvas/assets/webvas.wasm"
      assert_not_include html, "webvas:dev"
      assert_equal "asset", File.read(File.join(source, "site", "assets", "image.bin"))
    end
  end

  def test_build_rejects_output_symlinked_to_the_project
    Dir.mktmpdir do |directory|
      File.write(File.join(directory, "index.html"), "original")
      File.write(File.join(directory, "app.rb"), "app")
      File.symlink(directory, File.join(directory, "site"))
      error = StringIO.new

      assert_equal 1, Webvas::CLI.run(["build", "--root", directory, "-o", "site"], out: StringIO.new, err: error)
      assert_include error.string, "Build output cannot overwrite the project"
      assert_equal "original", File.read(File.join(directory, "index.html"))

      File.unlink(File.join(directory, "site"))
      FileUtils.mkdir_p(File.join(directory, "assets"))
      File.symlink(File.join(directory, "assets"), File.join(directory, "site"))
      error = StringIO.new
      assert_equal 1, Webvas::CLI.run(["build", "--root", directory, "-o", "site/output"], out: StringIO.new, err: error)
      assert_include error.string, "Build output cannot be inside the project's assets directory"
      assert_false File.exist?(File.join(directory, "assets", "output"))
    end
  end

  def test_build_custom_bundles_the_wasm_and_local_loader
    Dir.mktmpdir do |directory|
      source = File.join(directory, "project")
      FileUtils.mkdir_p(File.join(source, "bin"))
      File.write(File.join(source, "index.html"), '<script src="__WEBVAS_LOADER__" data-runtime="__WEBVAS_RUNTIME__"></script><!-- webvas:dev -->')
      File.write(File.join(source, "app.rb"), "puts :ready")
      File.write(File.join(source, "Gemfile"), 'source "https://rubygems.org"')
      fake_bundle = File.join(source, "bin", "bundle")
      File.write(fake_bundle, <<~SH)
        #!/bin/sh
        while [ "$#" -gt 0 ]; do
          if [ "$1" = "-o" ]; then
            shift
            mkdir -p "$(dirname "$1")"
            : > "$1"
          fi
          shift
        done
      SH
      FileUtils.chmod(0o755, fake_bundle)
      original_path = ENV.fetch("PATH")
      ENV["PATH"] = "#{File.dirname(fake_bundle)}:#{original_path}"
      result = Webvas::CLI.run(["build", "--root", source, "--runtime", "custom"], out: StringIO.new, err: StringIO.new)

      assert_equal 0, result
      assert_true File.file?(File.join(source, "dist", "assets", "webvas.wasm"))
      assert_true File.file?(File.join(source, "dist", "assets", "webvas", "worker.js"))
      html = File.read(File.join(source, "dist", "index.html"))
      assert_include html, "./assets/webvas/loader.js"
      assert_include html, "./assets/webvas.wasm"
      assert_not_include html, "webvas:dev"
    ensure
      ENV["PATH"] = original_path
    end
  end

  def test_serve_command_binds_configured_root_and_closes_cleanly
    Dir.mktmpdir do |directory|
      File.write(File.join(directory, "index.html"), "ready")
      output = StringIO.new
      error = StringIO.new
      thread = Thread.new do
        Webvas::CLI.run(["serve", "--host", "127.0.0.1", "--port", "0", "--root", directory], out: output, err: error)
      end
      Timeout.timeout(2) { sleep 0.01 until output.string.include?("Serving ") }
      port = output.string[/:(\d+)\s*\z/, 1].to_i
      assert_include http_get(port, "/"), "ready"
      thread.raise(Interrupt)
      assert_equal 0, thread.value
      assert_equal "", error.string
    ensure
      thread&.kill if thread&.alive?
      thread&.join(1)
    end
  end

  def test_server_sets_wasm_mime_and_rejects_path_traversal
    Dir.mktmpdir do |directory|
      File.write(File.join(directory, "index.html"), "<body><!-- webvas:dev --></body>")
      File.write(File.join(directory, "runtime.wasm"), "wasm")
      File.write(File.join(directory, ".env"), "secret")
      Dir.mktmpdir do |private_directory|
        File.write(File.join(private_directory, "secret.txt"), "secret")
        File.symlink(private_directory, File.join(directory, "linked"))
        server = Webvas::CLI::Server.new(directory, host: "127.0.0.1", port: 0)
        thread = Thread.new { server.start }

        response = http_get(server.port, "/runtime.wasm")
        assert_include response, "Content-Type: application/wasm"
        assert_include response, "\r\n\r\nwasm"
        assert_include http_get(server.port, "/"), "/__webvas/live.js"
        assert_include http_get(server.port, "/%2e%2e/outside.txt"), "404 Not Found"
        assert_include http_get(server.port, "/.env"), "404 Not Found"
        assert_include http_get(server.port, "/linked/secret.txt"), "404 Not Found"
        assert_include http_request(server.port, "POST", "/runtime.wasm"), "405 Method Not Allowed"
        assert_include http_get(server.port, "/%"), "400 Bad Request"
      ensure
        server&.close
        thread&.join(1)
      end
    end
  end

  def test_server_reloads_after_a_file_changes
    Dir.mktmpdir do |directory|
      File.write(File.join(directory, "app.rb"), "first")
      server = Webvas::CLI::Server.new(directory, host: "127.0.0.1", port: 0)
      thread = Thread.new { server.start }
      socket = TCPSocket.new("127.0.0.1", server.port)
      socket.write("GET /__webvas/events HTTP/1.1\r\nHost: localhost\r\n\r\n")
      while (line = socket.gets("\r\n")) && line != "\r\n"; end
      assert_equal ": connected\n", socket.gets
      socket.gets
      File.write(File.join(directory, "app.rb"), "changed")
      assert_equal "data: reload\n", Timeout.timeout(5) { socket.gets }
    ensure
      socket&.close
      server&.close
      thread&.join(1)
    end
  end

  private

  def http_get(port, path)
    http_request(port, "GET", path)
  end

  def http_request(port, method, path)
    socket = TCPSocket.new("127.0.0.1", port)
    socket.write("#{method} #{path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
    socket.read
  ensure
    socket&.close
  end
end
