# Launcher Plugins

The shell launches these plugins when the launcher is started, and communicates to them via JSON IPC.

See the plugins in this directory as examples of how to create a plugin.

## Plugin Metadata

Every plugin is a directory that contains a `meta.json` file with the following properties:

```js
{
    "name": "Name of Plugin",
    "description": "Description of the Plugin",
    "pattern": "Regular expression that queries should match in order to query it",
    "exec": "The name of the file which will be executed as the plugin service",
    "icon": "some-gicon-name"
}
```

## Requests by Pop Shell

### Tab Completion

Requests for the plugin to complete the search, if possible. The plugin should remember the last query it received if it intends to complete a query

```json
{
    "event": "complete"
}
```

### Query

Fetch a list of search results for the launcher to choose from

```json
{
    "event": "query",
    
    "value": "Text to search"
}
```

### Quit

Request for the plugin to quit

```json
{
    "event": "quit"
}
```

### Submit

Request to apply one of the search results that were previously queried

```json
{
    "event": "submit",

    "id": number
}
```

## Responses by Plugins

### Queried

A list of search results to display

```js
{
    "event": "queried",

    // An array of selections to choose from
    "selections": [
        {
            // An ID that the user can select to execute in the plugin
            "id": number,

            // Text to show as the item's name
            "name": string,

            // Text to show beneath the option to describe it
            "description": null | string,

            // Use this if your icon can be fetched from an icon theme
            "icon": undefined | string,

            // Use this if your icon is a mime type string
            "content_type": undefined | string,
        }
    ]
}
```

### Fill

Replaces the launcher text with these contents

```json
{
    "event": "fill",

    "text": string
}
```

### Close

Requests to close the launcher

```json
{
    "event": "close"
}
```

### Noop

Tell the shell to do nothing when it expects a response

```json
{
    "event": "noop"
}