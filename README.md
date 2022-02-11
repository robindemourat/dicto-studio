Dicto-studio
===

A command-line experiment to turn dicto compositions into hard-cut montage files.

Disclaimer: **this is experimental !!!!**

It only works with compositions built from .mp4 local files for now.

## Installation

```bash
git clone https://github.com/robindemourat/dicto-studio
cd dicto-studio
npm i
```

## Usage

1. export your corpus from dicto
2. copy it within the folder of the script

```bash
node studio.js my_dicto_corpus.json
```

Result is in `output` folder.