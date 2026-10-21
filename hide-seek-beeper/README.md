# Hide & Beep V4 — phone multiplayer hide-and-seek

A phone-friendly web app using Node.js, Express, and Socket.IO.

## Gameplay

1. One player creates a room as **host**. Friends join with a five-character room code and must enter a name; hosts must enter a name too. The host is **not** automatically the seeker.
2. In the lobby, everyone appears on the live roster. The host chooses the number of starting seekers (minimum 1, maximum number of players minus 1) and taps **Spin the Wheel**. The server randomly chooses the starting seekers, and all phones see who was picked (red). The host may spin again before beginning the round.
3. Host presses **Go** to start the synchronized **host-configurable hiding countdown (15 seconds to 15 minutes)**.
4. Once the hiding countdown reaches zero, the round timer starts counting **up**. Seekers can trigger a **5-second beep** on remaining hiders' phones (10-second cooldown), or tap **Found** on a hider's name.
5. Found hiders turn **red** and join the seekers; all unfound players stay **green**. The round ends when all hiders have been found, freezing the timer.

### Wheel rules

- The host alone controls seeker count and spins.
- Selection is securely randomized by the server, not clients; the on-screen spinning wheel is an animation and the final named result is authoritative.
- If another player joins or leaves the lobby, the previous selection is cleared so every player in the room can participate in the next spin.
- At least two players must be present, with at least one seeker and one hider.

## Run

Install Node.js 18 or newer, then:

```bash
npm install
npm start
```

Open http://localhost:3000. To use separate phones on the Internet, deploy the Node server to a host supporting HTTPS and WebSockets and share its URL. Game state is stored only in server memory; restarting the server clears rooms.

## Phone limitations

The hiders should tap **Enable Sound** and keep the page in the foreground, with screens unlocked, for reliable beeps. iOS/Android often stop browser audio in the background. No GPS tracking is involved.

Rooms have a maximum of 30 players. Joining is closed after Go. The host leaving ends the game.

## Using it on a phone

Deploy the entire project to a Node.js host that supports WebSockets and HTTPS. On Render, create a Web Service connected to a GitHub repository containing the app, use `npm install` as the build command and `npm start` as the start command. Share the public HTTPS URL with friends. On iPhone, open the site in Safari then Share > Add to Home Screen; on Android, use Chrome menu > Add to Home screen / Install app (if offered). Players must permit sound by tapping Enable Sound and keeping the site open; browsers often pause sound when locked or backgrounded.

Local testing: `npm install && npm start` then browse to `http://localhost:3000` on the computer. Phones on the same Wi-Fi can use `http://YOUR_COMPUTER_LAN_IP:3000` if the Windows firewall allows inbound connections, but audio may be restricted over non-HTTPS connections.
