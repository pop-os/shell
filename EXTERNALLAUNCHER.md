# Pop-Shell launcher: ExternalLauncher
Type `.{script}` in the launcher, to call a script or program in ~/.pop-shell-launchers/ called `{script}` with either `{tag} search` or `{tag} apply`

Scripts always receive 2 arguments:
* tag: timestamp which changes each time the launcher window is displayed
* action: a keyword of either **search** or **apply**
    * **search**: must supply a newline separated list of tab separated values: `item-value \t display-name  \t [optional: icon-name]`  
    ExternalLauncher will cache list results using a compound key of `{tag}` and `{script}`
    * **apply**: is called with the additional arguments of the select item's `item-value` and  `display-name` values.

---

## Example script

Here is an example of a script, called `bt`, that uses [brotab](https://github.com/balta2ar/brotab) with firefox or google chrome, to control their tabs.

```
#!/usr/bin/env bash

tag="${1}"
action="${2^^}"
item_value="${3}"

if [ ! -f "/tmp/bt.idx" ] || [ "$tag" != "$(cat /tmp/bt.idx)" ]; then
    echo "$tag">"/tmp/bt.idx"
    brotab index
fi

if [ "${action}" == "SEARCH" ]; then
    if [ -n "${item_value}" ]; then
        brotab search "${item_value}*"
    else
        active_ids="$(brotab active | cut -f1 | tr '\n' '|' | sed 's/\./\\./g')"
        regex="^(${active_ids::-1})\t"
        brotab list | grep -P "$regex"
    fi
fi

if [ "${action}" == "APPLY" ]; then
    if [ -n "${item_value}" ]; then
        brotab activate --focused "${item_value}"
    fi
fi
```

`./bt github pop-shell` now displays browser tabs containing "github pop-shell"; Selecting it, focuses that tab in the browser.