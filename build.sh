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
cp src/{*.ts,*.js} build/
cp lib/{*.ts,*.js} build/

mkdir -p www/
cp src/*.js www/
tsc --strict --lib esnext,dom -t es6 --outDir www build/*.ts

cd www
echo "${HTML_HEAD}" > index.html
echo "${HTML_COMPONENTS}" >> index.html
for script in $(ls *.js) ; do
  echo "<script type=\"text/javascript\" src=\"${script}\"></script>" >> index.html
done
echo "${HTML_TAIL}" >> index.html
