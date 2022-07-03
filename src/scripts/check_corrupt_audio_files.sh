#!/bin/bash
if [ "$#" -ne 1 ]
then
  echo "Usage: ./check_audio_files.sh /path/to/audio/files"
  exit 1
fi

bad_files=()
for file in $1/*; do
  if [[ "$(file ${file} | tee /dev/tty)" != "${file}: Ogg data, Opus audio," ]]; then
    bad_files+=($file)
  fi
done
echo "=============Bad files============"
printf '%s\n' "${bad_files[@]}"


if [ ${#bad_files[@]} -eq 0 ]; then
    exit 0
else
    exit 1
fi
