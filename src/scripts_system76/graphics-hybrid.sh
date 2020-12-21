#!/bin/sh
#
# name: Switch to Hybrid Graphics
# icon: preferences-system-symbolic
# description: Use integrated GPU for display; applications may request discrete
# keywords: integrated graphics switch intel nvidia hybrid

gnome-terminal -- sh -c '
    if system76-power graphics hybrid; then
        echo "Succesfully switched. You may now reboot"
    else
        echo "Failed to switch\nPress key to exit"
    fi
    
    read x  
'