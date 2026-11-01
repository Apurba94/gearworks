# Gearworks

A factory logic puzzle for phones. Parts leave a chute one after another. Lay belts, sorters and paint booths on the floor so that each
part reaches a crate of its own colour. One part on the floor or in the wrong crate stops the line.

**[Play it now](https://apurba94.github.io/gearworks/)** in your phone's browser, then use "Add to Home Screen" to install it. After the
first visit it works offline.

* 40 factories, from single belts to three-colour lines with rocks in the way.
* Belts, left and right sorters, and paint booths, introduced over time.
* Watch your line run part by part, and see exactly where it went wrong.
* Three stars for using as few tiles as the designed answer.

No ads, no accounts, no tracking and no network use after the first load.

## Run from source

```bash
npx serve .
npm test
```

Plain JavaScript with no dependencies. `src/logic.js` holds the simulation and level builder, and `src/main.js` holds the screens.

## How it is tested

Each level is built around a working factory, and the tests replay that answer on all 40 levels with the tiles provided. That proves that
every level can be finished with three stars. Other solutions may use fewer tiles.

## License

MIT
