Berrytube Connection Bouncer
====================

So here it is, around 10 months after I created it, and probably 6+ since I stopped working on it, the Berrytube Connection Bouncer. Like bouncers for other services, such as ZNC for IRC, it allows you to share a single account across multiple clients/browsers/devices.

For berrytube this means, no need for YourNamePhone, YourNameIRC etc, and, as long as you have at least one device online(or rejoin within a customizeable amount of time), closing your browser won't lose berry, and various other benefits 

It was intended to be a "oh let me hack this shit out in a few hours while hungover" type project, and still has the organization and code-elegance of such a project. If I were to rewrite it, I'd probably make some fancy module dedicated to socket.io bouncing, but meh. I kept holding back on releasing it cause I wanted to clean it up more, but that never happened.

##Installing

* Linux users: `git clone` this repo, make sure you have nodejs installed, along with npm, then run `npm install` in wherever you put this. I guess you could download the zip below instead, if you don't have git.
* Windows users: Download and extract [BTbouncer.zip](https://q-z.xyz/BTbouncer.zip), open that folder, then double click bt-bouncer.bat (this will take care of some prep stuff, as well as start the bouncer)

##Configuring

* There's a config.ini there for you to change some default settings, such as daemonization, username(it prompts if not specified), disconnect window, and more.

##Running

* Linux users: just run `node index.js`. You may want to set it up as a systemd service, if you want it to run by default.

* Windows users: as mentioned above, bt-bouncer.bat runs it as well.

* EVERYONE: There's a userscript portion of the bouncer. I have it hosted at https://q-z.xyz/BouncyTube.user.js . Install that, and optionally set it up in berrytube's settings to autoconnect. Note that if your "Remember Me"'d credentials are incorrect, and/or do not match the name you entered when you started the bouncer, autoconnect can get you in a situation where you cannot connect properly until you turn it off in BT's settings. **If you want to be able to connect from the android app**, you will need to either have your ports forwarded properly, or have this running on a server, and you will also have to change the IP(and possibly port) specified in the userscript's settings(found with all the other berrytube settings).

##Bugs/Missing Features (PLEASE READ)

* **Kicks will break the bouncer** - I haven't gotten around to fixing this because I don't want to get kicked repeated, spam chat with spaghetti, etc, and the testing Tube doesn't have the spaghetti kicker turned on last I checked.
* **Occasionally(pretty rarely) the connection just gets stuck** - Solved by restarting the bouncer, cause it's so rare

* **The features that split ops chat from regular chat for the android app are largely untested**
