# drawall
This is a CAD tool for making quick and easy mockups of floor plans.

It's designed to support fuzzy constraints given imprecise measurements—because we've all had the experience of taking a thousand measurements, then trying to draw it up and finding that the inches don't *quite* add up! Or trying to plan a move based off of vague dimensions provided by a landlord.

## development
A bit absurd, because I've thus far avoided doing things properly (aka using webpack), but easy to use. Requires python3 and tsc on the path.

I like to run `test-server.py` to spin up a basic a web server served at http://localhost:8234, which calls `build.sh` automatically whenever the page is refreshed. Yeah. It's silly.

Or you can just run `build.sh` yourself manually and load up the generated `index.html` file in your browser. It's just a static site, so there's no actual backend to spin up.

Note that for the files for which order matters, the order is determined by the list hardcoded in `build.sh`.

