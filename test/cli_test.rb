# frozen_string_literal: true

require_relative "test_helper"
require "stringio"
require "tmpdir"
load File.expand_path("../exe/webvas", __dir__)

class WebvasCLITest < Test::Unit::TestCase
  class FakeSocket
    attr_reader :output

    def initialize(request, write_error: nil)
      @input = StringIO.new(request)
      @output = +"".b
      @write_error = write_error
      @closed = false
    end

    def gets(*arguments) = @input.gets(*arguments)
    def write(value)
      raise @write_error if @write_error

      @output << value
    end
    def close = (@closed = true)
    def closed? = @closed
  end

  def test_static_server_serves_wasm_without_text_charset
    Dir.mktmpdir do |root|
      File.binwrite(File.join(root, "runtime.wasm"), "wasm")
      response = serve_request(root, "HEAD /runtime.wasm HTTP/1.1\r\n")

      assert_include response, "HTTP/1.1 200 OK"
      assert_include response, "Content-Type: application/wasm\r\n"
      assert_not_include response, "application/wasm; charset=utf-8"
    end
  end

  def test_static_server_blocks_encoded_traversal_and_index_symlinks
    Dir.mktmpdir do |root|
      Dir.mkdir(File.join(root, "linked"))
      Dir.mktmpdir do |outside|
        secret = File.join(outside, "secret")
        File.write(secret, "private")
        File.symlink(secret, File.join(root, "linked", "index.html"))

        assert_include serve_request(root, "GET /%2e%2e/secret HTTP/1.1\r\n"), "404 Not found"
        response = serve_request(root, "GET /linked/ HTTP/1.1\r\n")
        assert_include response, "404 Not found"
        assert_not_include response, "private"
      end
    end
  end

  def test_static_server_rejects_other_methods
    Dir.mktmpdir do |root|
      assert_include serve_request(root, "POST / HTTP/1.1\r\n"), "405 Method not allowed"
    end
  end

  def test_static_server_gzips_responses_when_requested
    Dir.mktmpdir do |root|
      content = "canvas " * 300
      File.binwrite(File.join(root, "sketch.rb"), content)
      response = serve_request(root, "GET /sketch.rb HTTP/1.1\r\nAccept-Encoding: gzip\r\n\r\n")
      headers, body = response.split("\r\n\r\n".b, 2)

      assert_include headers, "Content-Encoding: gzip"
      assert_equal content, Zlib::GzipReader.new(StringIO.new(body)).read
    end
  end

  def test_static_server_injects_reload_support_for_html
    Dir.mktmpdir do |root|
      File.write(File.join(root, "index.html"), "<body>page</body>")

      assert_include serve_request(root, "GET / HTTP/1.1\r\n\r\n"), '<script src="/__webvas_reload.js" defer></script>'
      assert_include serve_request(root, "GET /__webvas_reload.js HTTP/1.1\r\n\r\n"), "location.reload()"
    end
  end

  def test_static_server_treats_a_disconnected_client_as_normal
    Dir.mktmpdir do |root|
      File.write(File.join(root, "index.html"), "page")
      socket = FakeSocket.new("GET / HTTP/1.1\r\n", write_error: Errno::EPIPE)

      assert_nothing_raised { Webvas::CLI.handle_request(socket, File.realpath(root)) }
      assert_true socket.closed?
    end
  end

  def test_new_does_not_overwrite_existing_project_files
    Dir.mktmpdir do |root|
      readme = File.join(root, "README.md")
      File.write(readme, "keep this")

      assert_raise(SystemExit) { Webvas::CLI.create(root) }
      assert_equal "keep this", File.read(readme)
      assert_false File.exist?(File.join(root, "sketch.rb"))
    end
  end

  def test_new_creates_a_cdn_playground_and_ruby_entrypoint
    Dir.mktmpdir do |root|
      project = File.join(root, "sketch")
      Webvas::CLI.create(project)
      index = File.read(File.join(project, "index.html"))

      assert_include index, "https://rbgfx.github.io/webvas/app.js"
      assert_include index, "https://rbgfx.github.io/webvas/assets/webvas.wasm"
      assert_include File.read(File.join(project, "app.rb")), 'require "gesso"'
      assert_include File.read(File.join(project, "Gemfile")), 'gem "ruby_wasm"'
      assert_include File.read(File.join(project, ".gitignore")), "/.webvas/"
    end
  end

  def test_build_exports_site_with_the_official_cdn_runtime
    Dir.mktmpdir do |root|
      project = File.join(root, "sketch")
      output = File.join(root, "dist")
      Webvas::CLI.create(project)

      Webvas::CLI.build([project, "-o", output])
      index = File.read(File.join(output, "index.html"))

      assert_include index, "https://rbgfx.github.io/webvas/assets/webvas.wasm"
      assert_path_exist File.join(output, "app.rb")
      assert_false File.exist?(File.join(output, "assets", "webvas.wasm"))
    end
  end

  private

  def serve_request(root, request)
    socket = FakeSocket.new(request)
    Webvas::CLI.handle_request(socket, File.realpath(root))
    socket.output
  end
end
