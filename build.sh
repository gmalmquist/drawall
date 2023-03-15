#!/usr/bin/env bash

HTML_HEAD=$(cat <<EOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>drawall</title>
  <link rel="stylesheet" type="text/css" href="main.css"></link>
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

mkdir -p www/
cp src/*.js www/
tsc --strict --lib esnext,dom -t es6 --outDir www src/*.ts

cd www
echo "${HTML_HEAD}" > index.html
echo "${HTML_COMPONENTS}" >> index.html
for script in $(ls *.js) ; do
  echo "<script type=\"text/javascript\" src=\"${script}\"></script>" >> index.html
done
echo "${HTML_TAIL}" >> index.html
