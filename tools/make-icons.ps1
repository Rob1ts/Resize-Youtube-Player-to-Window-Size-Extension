Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'src\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;

public static class YtwIcon {
    private static GraphicsPath RoundedRect(RectangleF r, float radius) {
        float d = radius * 2f;
        var path = new GraphicsPath();
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    public static void Draw(string path, int size) {
        using (var bmp = new Bitmap(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(bmp)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);

            float margin = Math.Max(0.5f, size * 0.035f);
            var tile = new RectangleF(margin, margin, size - margin * 2f, size - margin * 2f);
            float tileRadius = size * 0.22f;

            using (var tilePath = RoundedRect(tile, tileRadius))
            using (var red = new LinearGradientBrush(tile, Color.FromArgb(255, 255, 0, 51), Color.FromArgb(255, 200, 0, 36), 90f)) {
                g.FillPath(red, tilePath);
            }

            float inset = size * 0.19f;
            var frame = new RectangleF(inset, inset, size - inset * 2f, size - inset * 2f);
            float frameRadius = size * 0.13f;
            float penWidth = Math.Max(1.2f, size * 0.055f);
            using (var framePath = RoundedRect(frame, frameRadius))
            using (var pen = new Pen(Color.White, penWidth)) {
                pen.LineJoin = LineJoin.Round;
                g.DrawPath(pen, framePath);
            }

            float cx = size * 0.50f;
            float cy = size * 0.50f;
            float halfHeight = size * 0.17f;
            float halfWidth = size * 0.145f;
            var play = new PointF[] {
                new PointF(cx - halfWidth + size * 0.02f, cy - halfHeight),
                new PointF(cx - halfWidth + size * 0.02f, cy + halfHeight),
                new PointF(cx + halfWidth + size * 0.03f, cy)
            };
            using (var white = new SolidBrush(Color.White)) {
                g.FillPolygon(white, play);
            }

            bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png);
        }
    }
}
'@

foreach ($size in @(16, 32, 48, 128, 512)) {
    $path = Join-Path $outDir ("icon{0}.png" -f $size)
    [YtwIcon]::Draw($path, $size)
    Write-Host "Wrote $path"
}
