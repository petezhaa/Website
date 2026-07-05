// mandelbrot.cpp — the math engine, freestanding C++ -> wasm32. For each pixel
// it iterates z -> z^2 + c until |z| escapes, and writes one byte per pixel
// into a static buffer in linear memory; the renderer reads that buffer and
// maps bytes through a palette. No trig, no libm — just the escape-time
// algorithm, which is embarrassingly parallel and a good compute flex.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/mandelbrot.bin cpp/mandelbrot.cpp

#define EXPORT(n) __attribute__((export_name(n)))

static const int MAXW = 900;
static const int MAXH = 560;
static unsigned char BUF[MAXW * MAXH]; // 0 = inside the set, 1..255 = escape band

extern "C" EXPORT("buf_ptr") int buf_ptr() {
  return (int)(unsigned long)&BUF[0];
}
extern "C" EXPORT("max_w") int max_w() { return MAXW; }
extern "C" EXPORT("max_h") int max_h() { return MAXH; }

// render the view centered at (cx, cy), `scale` complex-units per pixel.
// returns the number of bytes written (w*h).
extern "C" EXPORT("render") int render(int w, int h, double cx, double cy,
                                       double scale, int maxIter) {
  if (w > MAXW) w = MAXW;
  if (h > MAXH) h = MAXH;
  double halfW = w * 0.5;
  double halfH = h * 0.5;
  for (int py = 0; py < h; py++) {
    double y0 = cy + (py - halfH) * scale;
    int row = py * w;
    for (int px = 0; px < w; px++) {
      double x0 = cx + (px - halfW) * scale;
      double zr = 0.0, zi = 0.0, zr2 = 0.0, zi2 = 0.0;
      int it = 0;
      while (zr2 + zi2 <= 4.0 && it < maxIter) {
        zi = 2.0 * zr * zi + y0;
        zr = zr2 - zi2 + x0;
        zr2 = zr * zr;
        zi2 = zi * zi;
        it++;
      }
      // inside -> 0; escaped -> a cyclic band the palette turns into color
      BUF[row + px] = (it >= maxIter) ? 0 : (unsigned char)(1 + (it % 254));
    }
  }
  return w * h;
}
