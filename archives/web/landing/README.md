# Hey! Welcome to the template!

All of Hover's templates are built with React, NextJS and TailwindCSS. If you're already comfortable with NextJS, feel free to dig in and get started. If not, we'll provide some details below to get you up and running.

Demos for all of our templates can be found [here](https://www.hover.dev/templates).

## Let's get things running

This template is built on top of [NextJS](https://nextjs.org/), a full stack development framework built on top of React.

We won't take time here going over exactly how NextJS works on a deep level (to be fair, this project doesn't use Next at a deep level), but if you're interested in learning, their docs are [here](https://nextjs.org/docs/getting-started).

At the root of your project, you'll see a `package.json` file defining our dependencies.

Most of this is boilerplate, but I will call out the following dependencies:

- `framer-motion` -> A react based animation library used for most animations
- `tailwindcss` -> All styling uses Tailwind CSS for this project

Now that that's out of the way, you can get your project running by first installing dependencies.

From your terminal, run:

```
npm install
# or
yarn install
```

This will take a minute or two, but once that's done, you should be able to run the following command:

```
npm run dev
# or
yarn dev
```

This will start your project on `localhost:3000`

## The file structure

Because this is a NextJS project, we follow the standard NextJS pattern for organizing this project. If you're familiar with the latest in Next, you might know about the relatively new `app` directory. This particular project uses the older `pages` directory as it's a bit simpler for beginners and makes it easier for those of you who'd like to migrate these components out of NextJS.

If you WOULD like to upgrade to the app directory, you can find docs on that [here](https://nextjs.org/docs/pages/building-your-application/upgrading/app-router-migration), but it shouldn't make any difference for a project like this one.

Inside of the `src/pages/` directly you'll find 3 files:

- `_app.tsx/jsx` -> A file which wraps around every page in our app. For this project, we've left this empty.
- `_document.tsx/jsx` -> Essentially the NextJS version of your base "HTML document". Nothing fancy here beyond a couple of tailwind classes.
- `index.tsx/jsx` -> This represents our home route. You should start digging around from here. We also define our font class names here, imported from the `src/fonts` file. If you'd like to update this font, check out [this doc](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts).

To add MORE routes to your project, see [this doc](https://nextjs.org/docs/basic-features/pages).

Inside of the `/src/components/` directory you'll find all of the components being rendered in our home route.

## Styling

As noted, styling is done using [Tailwind CSS](https://tailwindcss.com/).

Open up the `tailwind.config.js/ts` file to add to your configuration. For this project, we've left this as an empty template.

The color palette for this project is made up of the tailwind `indigo` palette for primary colors, the `zinc` palette for neutral colors, and a few blacks/whites/other utility colors here and there. If you'd like to update these palettes, you could do a find and replace throughout the repository, for instance changing all instances of `indigo` to `red`.
