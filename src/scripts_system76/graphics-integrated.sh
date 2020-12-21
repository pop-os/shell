#!/bin/sh
#
# name: Switch to Integrated Graphics
# icon: preferences-system-symbolic
# description: Use integrated GPU for display and applications
# keywords: integrated graphics switch intel

gnome-terminal -- sh -c '
    if system76-power graphics integrated; then
        echo "Succesfully switched. You may now reboot"
    else
        echo "Failed to switch\nPress key to exit"
    fi
    
    read x
'