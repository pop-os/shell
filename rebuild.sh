# Build and install extension
make all
make install

left="h"
down="j"
up="k"
right="l"

# Disable incompatible shortcuts
# Restore the keyboard shortcuts: disable <Super>Escape
dconf write /org/gnome/mutter/wayland/keybindings/restore-shortcuts "@as []"
# Hide window: disable <Super>h
dconf write /org/gnome/desktop/wm/keybindings/minimize "@as []"
# Open the application menu: disable <Super>m
dconf write /org/gnome/shell/keybindings/open-application-menu "@as []"
# Switch to workspace left: disable <Super>Left
dconf write /org/gnome/desktop/wm/keybindings/switch-to-workspace-left "@as []"
# Switch to workspace right: disable <Super>Right
dconf write /org/gnome/desktop/wm/keybindings/switch-to-workspace-right "@as []"

# Super + direction keys, move window left and right monitors, or up and down workspaces
# Move window one monitor to the left
dconf write /org/gnome/desktop/wm/keybindings/move-to-monitor-left "['<Primary><Shift><Super>Left','<Primary><Shift><Super>${left}']"
# Move window one workspace down
dconf write /org/gnome/desktop/wm/keybindings/move-to-workspace-down "['<Primary><Shift><Super>Down','<Primary><Shift><Super>${down}']"
# Move window one workspace up
dconf write /org/gnome/desktop/wm/keybindings/move-to-workspace-up "['<Primary><Shift><Super>Up','<Primary><Shift><Super>${up}']"
# Move window one monitor to the right
dconf write /org/gnome/desktop/wm/keybindings/move-to-monitor-right "['<Primary><Shift><Super>Right','<Primary><Shift><Super>${right}']"

# Super + Ctrl + direction keys, change workspaces, move focus between monitors
# Move to workspace below
dconf write /org/gnome/desktop/wm/keybindings/switch-to-workspace-down "['<Primary><Super>Down','<Primary><Super>${down}']"
# Move to workspace above
dconf write /org/gnome/desktop/wm/keybindings/switch-to-workspace-up "['<Primary><Super>Up','<Primary><Super>${up}']"

# Toggle maximization state
dconf write /org/gnome/desktop/wm/keybindings/toggle-maximized "['<Super>m']"
# Lock screen
dconf write /org/gnome/settings-daemon/plugins/media-keys/screensaver "['<Super>Escape']"
# Home folder
dconf write /org/gnome/settings-daemon/plugins/media-keys/home "['<Super>f']"
# Launch email client
dconf write /org/gnome/settings-daemon/plugins/media-keys/email "['<Super>e']"
# Launch web browser
dconf write /org/gnome/settings-daemon/plugins/media-keys/www "['<Super>b']"

# Enable extension
gnome-extensions enable "pop-shell@system76.com"

echo "Restart shell!"
if [ -n "$(which xdotool)" ]
then
    xdotool key alt+F2
    sleep 0.5
    xdotool key r Return
fi

journalctl -o cat -n 0 -f "$(which gnome-shell)"
