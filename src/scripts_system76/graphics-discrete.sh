#!/bin/sh
#
# name: Switch to NVIDIA Graphics
# icon: preferences-system-symbolic
# description: Use NVIDIA GPU for display and applications
# keywords: nvidia graphics switch

gnome-terminal -- sh -c '
    if system76-power graphics nvidia; then
        echo "Succesfully switched. You may now reboot"
    else
        echo "Failed to switch\nPress key to exit"
    fi

    read x
'