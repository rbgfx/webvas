const triangle = `require "rbgl"
require "webvas"

include Larb
include RBGL::Engine

window = RBGL::GUI::Window.new(
  width: 320, height: 240,
  backend: Webvas::Backend.new(width: 320, height: 240, pixelated: true)
)

pipeline = Pipeline.create do
  vertex do |input, _uniforms, output|
    output.position = input.position.to_vec4
    output.color = input.color
  end
  fragment do |input, _uniforms, output|
    output.color = input.color
  end
end
pipeline.cull_mode = :none
vertices = VertexBuffer.from_array(VertexLayout.position_color, [
  { position: Vec3[0.0, 0.65, 0.0], color: Color.red },
  { position: Vec3[-0.65, -0.65, 0.0], color: Color.green },
  { position: Vec3[0.65, -0.65, 0.0], color: Color.blue }
])

Webvas.run(window) do |context, _delta_time|
  context.clear(color: Color.from_hex("#101827"))
  context.bind_pipeline(pipeline)
  context.bind_vertex_buffer(vertices)
  context.draw_arrays(:triangles, 0, 3)
end
`;

const solid = `require "rbgl"
require "webvas"

window = RBGL::GUI::Window.new(
  width: 320, height: 240,
  backend: Webvas::Backend.new(width: 320, height: 240)
)

Webvas.run(window) do |context, _delta_time|
  context.clear(color: Larb::Color.from_hex("#315f58"))
end
`;

const interactive = triangle
  .replace("window = RBGL::GUI::Window.new(", "pressed = false\nwindow = RBGL::GUI::Window.new(")
  .replace("Webvas.run(window)", `window.on(:mouse_press) { pressed = true }
window.on(:mouse_release) { pressed = false }
window.on(:key_press) { |event| pressed = !pressed if event.key == :space }

Webvas.run(window)`)
  .replace('Color.from_hex("#101827")', 'Color.from_hex(pressed ? "#e5b36a" : "#123456")');

const gessoSketch = body => `require "gesso"

Gesso.run(width: 320, height: 240, runner: :web, pixelated: true) do
${body}
end
`;

const rlslShader = fragment => `require "rlsl"
require "webvas"

wgsl = RLSL.to_wgsl(:playground_shader) do
  uniforms { float :time }
  fragment do |frag_coord, resolution, u|
${fragment}
  end
end
Webvas.run_shader(Webvas::Shader.new(wgsl))
`;

export const examples = {
  rbgl: [
    { name: "RGB triangle", source: triangle },
    { name: "Solid canvas", source: solid },
    { name: "Interactive triangle", source: interactive }
  ],
  gesso: [
    { name: "Bubbles", source: gessoSketch(`  draw do
    background "#101827"
    50.times do |index|
      x = (index * 47 + frame_count * (index % 3 + 1)) % width
      y = (index * 31 + frame_count / 2) % height
      fill 240, 120 + index * 3, 80, 190
      no_stroke
      circle x, y, 5 + index % 8
    end
  end`) },
    { name: "Orbit", source: gessoSketch(`  draw do
    background "#101827"
    12.times do |index|
      angle = frame_count * 0.025 + index * Math::PI / 6
      fill 242, 165 + index * 5, 105
      no_stroke
      circle width / 2 + Math.cos(angle) * 72, height / 2 + Math.sin(angle) * 72, 7
    end
  end`) },
    { name: "Pointer", source: gessoSketch(`  draw do
    background "#101827"
    no_stroke
    fill "#f07850"
    circle mouse_x, mouse_y, 24
  end`) }
  ],
  rlsl: [
    { name: "Plasma", source: rlslShader(`    uv = frag_coord / resolution.y
    red = sin(u.time + uv.x * 7.0 + sin(uv.y * 5.0)) * 0.5 + 0.5
    green = sin(u.time * 0.7 + uv.y * 8.0) * 0.5 + 0.5
    blue = sin(u.time + uv.x * 3.0 + uv.y * 4.0) * 0.5 + 0.5
    vec3(red, green, blue)`) },
    { name: "Interference", source: rlslShader(`    uv = frag_coord / resolution
    wave = sin((uv.x + uv.y) * 38.0 + sin(uv.x * 18.0 - u.time) * 4.0)
    vec3(wave * 0.25 + 0.3, sin(wave + u.time) * 0.35 + 0.4, 0.65)`) },
    { name: "Rings", source: rlslShader(`    uv = (frag_coord - resolution / 2.0) / resolution.y
    radius = uv.x * uv.x + uv.y * uv.y
    shade = sin(radius * 130.0 - u.time * 2.0) * 0.5 + 0.5
    vec3(shade * 0.9, shade * 0.45, 0.2 + shade * 0.3)`) }
  ]
};
