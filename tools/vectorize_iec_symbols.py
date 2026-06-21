"""IEC 符号库批量矢量化脚本 (PNG base64 -> 真 SVG path)

输入: iec_symbols_svg/*.svg (每个文件 = base64 PNG 内嵌的伪 SVG)
输出: iec_symbols_svg/*.svg (覆盖为真 SVG path)

用法:
  python tools/vectorize_iec_symbols.py [--dry-run] [--filter "iec_0082"]

要求:
  - Python 3.11 (vtracer 0.6.15 在 3.11 编译)
  - pip install vtracer pillow

参数调优(基于测试):
  - colormode='binary': IEC 线条图全是黑白,二值最优
  - mode='polygon': polygon 比 spline 更锐利,符合工程图规范
  - filter_speckle=2: 过滤 2 像素以下的噪点
  - corner_threshold=60: 角度阈值,锐角识别(适合 IEC 折线)
  - length_threshold=4.0: 短于此长度的线段丢弃
"""
import os
import sys
import re
import base64
import argparse
import glob
import shutil
from pathlib import Path

try:
    import vtracer
except ImportError:
    print("ERROR: vtracer not installed. Run: pip install vtracer (Python 3.11)")
    sys.exit(1)


def vectorize_one(svg_path, tmp_dir, *, dry_run=False, verbose=False):
    """转换单个 SVG 文件。返回 (size_in, size_out)。"""
    with open(svg_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1) 抽 base64 PNG
    m = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', content)
    if not m:
        if verbose:
            print(f"  SKIP (no base64 PNG): {svg_path}")
        return None
    png_bytes = base64.b64decode(m.group(1))
    size_in = os.path.getsize(svg_path)

    # 2) 写临时 PNG
    tmp_png = os.path.join(tmp_dir, Path(svg_path).stem + '.png')
    with open(tmp_png, 'wb') as f:
        f.write(png_bytes)

    # 3) vtracer 矢量化
    tmp_svg = os.path.join(tmp_dir, Path(svg_path).stem + '.svg')
    try:
        vtracer.convert_image_to_svg_py(
            tmp_png,
            tmp_svg,
            colormode='binary',
            hierarchical='stacked',
            mode='polygon',
            filter_speckle=2,
            color_precision=6,
            layer_difference=16,
            corner_threshold=60,
            length_threshold=4.0,
            splice_threshold=45,
            path_precision=3,
        )
    except Exception as e:
        print(f"  FAIL: {svg_path} - {e}")
        return None

    # 4) 读 SVG 输出
    with open(tmp_svg, 'r', encoding='utf-8') as f:
        new_svg = f.read()
    size_out = len(new_svg)

    # 5) 干跑?只统计
    if dry_run:
        os.remove(tmp_png)
        os.remove(tmp_svg)
        return (size_in, size_out)

    # 6) 覆盖原文件(直接覆盖,git history 保留旧版本)
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(new_svg)
    os.remove(tmp_png)
    os.remove(tmp_svg)
    return (size_in, size_out)


def main():
    parser = argparse.ArgumentParser(description='IEC 符号批量矢量化')
    parser.add_argument('--src', default=r'E:\project\储能\ess-platform\iec_symbols_svg',
                        help='SVG 库目录')
    parser.add_argument('--filter', default=None, help='只转文件名包含此字符串的 (如 iec_0082)')
    parser.add_argument('--dry-run', action='store_true', help='只统计,不写文件')
    parser.add_argument('--verbose', action='store_true', help='打印每个文件')
    parser.add_argument('--backup', default=None, help='备份目录 (默认不备份)')
    args = parser.parse_args()

    src_dir = args.src
    if not os.path.isdir(src_dir):
        print(f"ERROR: directory not found: {src_dir}")
        sys.exit(1)

    # 临时目录
    tmp_dir = os.path.join(src_dir, '_vtracer_tmp')
    if os.path.isdir(tmp_dir):
        shutil.rmtree(tmp_dir)
    os.makedirs(tmp_dir, exist_ok=True)

    # 备份
    if args.backup and not args.dry_run:
        if os.path.isdir(args.backup):
            shutil.rmtree(args.backup)
        shutil.copytree(src_dir, args.backup,
                        ignore=shutil.ignore_patterns('_vtracer_tmp', '_*'))
        print(f"备份到: {args.backup}")

    # 文件列表
    files = sorted(glob.glob(os.path.join(src_dir, 'iec_*.svg')))
    if args.filter:
        files = [f for f in files if args.filter in os.path.basename(f)]
    print(f"待处理: {len(files)} 个 SVG")

    total_in = 0
    total_out = 0
    ok = 0
    skip = 0
    fail = 0

    for i, fp in enumerate(files, 1):
        if args.verbose or i % 50 == 0:
            print(f"  [{i}/{len(files)}] {os.path.basename(fp)}")
        result = vectorize_one(fp, tmp_dir, dry_run=args.dry_run, verbose=args.verbose)
        if result is None:
            skip += 1
            continue
        sin, sout = result
        total_in += sin
        total_out += sout
        ok += 1

    # 清理临时
    shutil.rmtree(tmp_dir, ignore_errors=True)

    print(f"\n=== 完成 ===")
    print(f"成功: {ok}")
    print(f"跳过: {skip}")
    print(f"失败: {fail}")
    print(f"原大小: {total_in/1024:.1f} KB")
    print(f"新大小: {total_out/1024:.1f} KB")
    if total_in > 0:
        print(f"压缩比: {total_in/total_out:.2f}x")


if __name__ == '__main__':
    main()