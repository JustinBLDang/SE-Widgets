# Spotify - Overlay Current Track
SE widget that displays the currently playing track on your spotify. Customize the layout of the display with various layouts, colors, and more.

Features:
1. Display song name, artist, album cover/video, duration.
2. Horizontal, Vertical, and Compact Layout
3. Customize text, panels, background gradient, and shape of widget

Video Preview:

![ezgif-2657c05dc2643a](https://github.com/user-attachments/assets/6cbf3514-96db-4499-9fe6-3a3486540ac0)

In Progress:
- Different overlay layouts
- Improve customization tools
- Reverse Engineer Spotify Canvas API
- Extend app to work with Youtube Music
   
# Setup (WIP)
Spotify Developer
1. Create a spotify developer account.
2. Create a new App.
3. Fill in details and save the **Client ID and Client Secret**.

Authorization
1. Go to my [Authorization Page](https://justinbldang.github.io/spotify-authorization/).
2. Fill in your Client ID.
3. Click **Log in with Spotify**
4. Once you log in, you will return to my [Authorization Page](https://justinbldang.github.io/spotify-authorization/) and should see the **Authorization code**.
   
Stream Elements
1. Create a overlay in [Stream Elements](https://streamelements.com/).
2. Open the new overlay and add a custom widget.
3. Copy code into the custom widget.
4. Fill in **Client ID, Client Secret ID, and Authorization Code**(See Authorization Section).

Once all the steps are done, you can copy the overlay URL from Stream Elements to create an overlay in OBS.
