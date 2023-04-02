#!/usr/bin/env bash

HTML_HEAD=$(cat <<EOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>drawall</title>
  <link rel="icon" type="image/svg+xml" href="/icons/axis-locked.svg"></link>
  <link rel="stylesheet" type="text/css" href="main.css"></link>
  <link rel="stylesheet" type="text/css" href="gui.css"></link>
  <link rel="stylesheet" type="text/css" href="popup.css"></link>
</head>
<body>
EOF
)

HTML_TAIL=$(cat <<EOF
</body>
</html>
EOF
)

HTML_COMPONENTS=$(cat src/*.html)

LIBS=$(cat lib.txt)

mkdir -p lib/
cd lib/
for lib in ${LIBS} ; do 
  name=$(basename "${lib}")
  if [ -f "${name}" ]; then
    >&2 echo "lib ${name} cached"
  else
    wget "${lib}"
    >&2 echo "lib ${name} downloaded"
  fi
done
cd ..

mkdir -p build/
rm build/*

for item in $(ls lib/{*.js,*.ts}); do 
  cat "${item}" | sed -e 's/\bexport //g' > "build/$(basename ${item})"
done

function compile() {
  tsc --strict --lib esnext,dom -t es6 --outDir build/ build/*.ts
}

for item in $(find src -name '*.ts' -o -name '*.js'); do 
  cp "${item}" "build/$(basename ${item})"
done

compile

mkdir -p www/

ORDERED=$(cat <<EOF
typeutil.js
util.js
linalg.js
spaces.js
time.js
units.js
icons.js
json.js
exportpng.js
ecs.js
mouse.js
controls.js
gui.js
vectorcanvas.js
canvas.js
tools.js
actions.js
hotkeys.js
dragging.js
ux.js
kinematics.js
constraints.js
model.js
popups.js
project.js
history.js
settings.js
app.js
EOF
)

echo '' > www/all.js
for item in ${ORDERED} ; do
  cat "build/${item}" >> www/all.js
  rm "build/${item}"
done

cat build/*.js >> www/all.js

echo "${HTML_HEAD}" > www/index.html
echo "${HTML_COMPONENTS}" >> www/index.html
echo "<script type=\"text/javascript\" src=\"all.js\"></script>" >> www/index.html
#for script in $(ls build/*.js | sort) ; do
#  echo "<script type=\"text/javascript\" src=\"$(basename ${script})\"></script>" >> www/index.html
#done
echo "${HTML_TAIL}" >> www/index.html
