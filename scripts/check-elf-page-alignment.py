#!/usr/bin/env python3
"""Fail when native ELF load segments are not compatible with 16 KiB pages."""

import glob
import os
import struct
import sys


def check(path):
    data = open(path, "rb").read()
    if data[:4] != b"\x7fELF" or data[5] != 1:
        raise ValueError(f"{path}: expected little-endian ELF")
    elf_class = data[4]
    if elf_class == 2:
        phoff = struct.unpack_from("<Q", data, 32)[0]
        entsize, count = struct.unpack_from("<HH", data, 54)
        ph_format = "<IIQQQQQQ"
    elif elf_class == 1:
        phoff = struct.unpack_from("<I", data, 28)[0]
        entsize, count = struct.unpack_from("<HH", data, 42)
        ph_format = "<IIIIIIII"
    else:
        raise ValueError(f"{path}: unsupported ELF class {elf_class}")
    expected_size = struct.calcsize(ph_format)
    if entsize < expected_size or count == 0:
        raise ValueError(f"{path}: invalid ELF program header table")
    segments = []
    for index in range(count):
        fields = struct.unpack_from(ph_format, data, phoff + index * entsize)
        if elf_class == 2:
            segment_type, _flags, offset, vaddr, _paddr, _filesz, _memsz, align = fields
        else:
            segment_type, offset, vaddr, _paddr, _filesz, _memsz, _flags, align = fields
        if segment_type == 1:
            segments.append((offset, vaddr, align))
    if not segments:
        raise ValueError(f"{path}: no PT_LOAD segments found")
    for offset, vaddr, align in segments:
        if align < 16384 or offset % 16384 != vaddr % 16384 or offset % align != vaddr % align:
            raise ValueError(
                f"{path}: PT_LOAD offset=0x{offset:x} vaddr=0x{vaddr:x} align=0x{align:x} is not 16 KiB compatible"
            )


def main(root):
    native = glob.glob(os.path.join(root, "**", "*.so"), recursive=True)
    if not native:
        raise ValueError(f"{root}: no packaged native libraries found to inspect")
    for path in native:
        check(path)
    print(f"16 KiB ELF PT_LOAD alignment verified for {len(native)} native libraries.")


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except (IndexError, OSError, ValueError, struct.error) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
