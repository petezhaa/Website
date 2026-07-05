// Snake, in actual Java. This file is compiled with javac and the resulting
// BYTECODE ships to the browser, where a small JVM interpreter written in
// TypeScript (lib/jvm.ts) executes it. javap -c Snake.class to see what runs.
//
// Deliberately constrained subset so the interpreter stays small: one class,
// static int / int[] state only, static methods only, no strings, no objects,
// no java.lang calls (even the RNG is a hand-rolled xorshift). The classic
// trick: each grid cell holds its remaining lifetime, so the body needs no
// list — the tail dies of old age.
public class Snake {
    static int w;
    static int h;
    static int[] grid;   // 0 empty, >0 snake (ticks left to live), -1 food
    static int hx;
    static int hy;
    static int dir;      // 0 up, 1 right, 2 down, 3 left
    static int pendingDir;
    static int len;
    static int score;
    static int alive;
    static int rng;

    static int rand(int n) {
        int r = rng;
        r = r ^ (r << 13);
        r = r ^ (r >>> 17);
        r = r ^ (r << 5);
        if (r == 0) {
            r = 42643801;
        }
        rng = r;
        int v = r % n;
        if (v < 0) {
            v = -v;
        }
        return v;
    }

    static void spawnFood() {
        int guard = 0;
        while (guard < 500) {
            int i = rand(w * h);
            if (grid[i] == 0) {
                grid[i] = -1;
                return;
            }
            guard = guard + 1;
        }
    }

    static void init(int width, int height, int seed) {
        w = width;
        h = height;
        grid = new int[w * h];
        int i = 0;
        while (i < w * h) {
            grid[i] = 0;
            i = i + 1;
        }
        hx = w / 2;
        hy = h / 2;
        dir = 1;
        pendingDir = 1;
        len = 3;
        score = 0;
        alive = 1;
        rng = seed;
        if (rng == 0) {
            rng = 88172645;
        }
        grid[hy * w + hx] = len;
        spawnFood();
    }

    // ignore 180-degree turns; the phone d-pad mashes them constantly
    static void setDir(int d) {
        if (d < 0) {
            return;
        }
        if (d > 3) {
            return;
        }
        if (d == dir) {
            return;
        }
        if (d + 2 == dir) {
            return;
        }
        if (d - 2 == dir) {
            return;
        }
        pendingDir = d;
    }

    // 0 = moved, 1 = ate, 2 = dead
    static int step() {
        if (alive == 0) {
            return 2;
        }
        dir = pendingDir;
        int nx = hx;
        int ny = hy;
        if (dir == 0) {
            ny = ny - 1;
        }
        if (dir == 1) {
            nx = nx + 1;
        }
        if (dir == 2) {
            ny = ny + 1;
        }
        if (dir == 3) {
            nx = nx - 1;
        }
        // walls wrap: it's a torus, like all good phones
        if (nx < 0) {
            nx = w - 1;
        }
        if (nx >= w) {
            nx = 0;
        }
        if (ny < 0) {
            ny = h - 1;
        }
        if (ny >= h) {
            ny = 0;
        }
        int cell = grid[ny * w + nx];
        if (cell > 1) { // running into your own body (tail-cell 1 is vacating)
            alive = 0;
            return 2;
        }
        int ate = 0;
        if (cell == -1) {
            ate = 1;
            len = len + 1;
            score = score + 10;
        }
        // age every body cell unless we just ate (eating grows the tail)
        if (ate == 0) {
            int i = 0;
            while (i < w * h) {
                if (grid[i] > 0) {
                    grid[i] = grid[i] - 1;
                }
                i = i + 1;
            }
        }
        hx = nx;
        hy = ny;
        grid[hy * w + hx] = len;
        if (ate == 1) {
            spawnFood();
        }
        return ate;
    }

    static int cell(int i) {
        return grid[i];
    }

    static int headIndex() {
        return hy * w + hx;
    }

    static int getScore() {
        return score;
    }

    static int isAlive() {
        return alive;
    }
}
