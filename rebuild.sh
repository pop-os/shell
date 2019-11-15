make all
make install
echo "Restart shell!"
journalctl -f | grep pop-shell
