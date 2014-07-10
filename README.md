# hyperquext-medirect

Follow Meta Refresh redirects on Hyperquext requests.

Note: This extension will have to parse the response. Which may make your app less efficient.

## Usage:

Decorating Hyperquext:

```
var request = hyperquextMeDirect(hyperquext)
```

From now on you can specify in options `{maxRedirects: 5}` and you're set.

## install

With [npm](https://npmjs.org) do:

```
npm install hyperquext-medirect
```

## license

MIT