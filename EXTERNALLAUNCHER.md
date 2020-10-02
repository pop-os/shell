# Pop-Shell launcher: ExternalLauncher
Type `.{script}` in the launcher, to call a script or program in ~/.pop-shell-launchers/ called `{script}` with either `{tag} list` or `{tag} apply`

Scripts always receive 2 arguments:
* tag: a unique session-id which only changes when the launcher window is displayed
* action: a keyword of either **list** or **apply**
    * **list**: must supply a newline separated list of tab separated values: `item-value \t display-name  \t [optional: icon-name]`  
    ExternalLauncher will cache list results using a compound key of `{tag}` and `{script}`
    * **apply**: is called with the additional arguments of the select item's `item-value` and  `display-name` values.

---

## Example script

Here is an example of a script, called `bt`, that uses [brotab](https://github.com/balta2ar/brotab) with firefox or google chrome, to control their tabs.

```
#!/usr/bin/env bash

# echo "$0 $*">>/tmp/bt.log

tag="${1}"
action="${2^^}"
item_value="${3}"

if [ "${action}" == "LIST" ]; then
    brotab list
fi

if [ "${action}" == "APPLY" ]; then
    brotab activate --focused "${item_value}"
fi
```

`.bt github pop-shell` now displays browser tabs containing "github pop-shell" in the title, and selecting it, focuses that tab in the browser.