# fixfiles in discord
### 11/29/24
today i finished implementing my fixfiles feature into [aspyn-utils](https://github.com/aspynect/aspyn-utils). 

## premise
the core of this part of the project is to create a more convenient solution to the common problem of someone sending a file that can't be viewed in discord (particularly commonly video and audio).

formerly, there were two solutions to this problem:
1. download the file, use ffmpeg to fix it, send it back in chat
2. tell the person sending the file to fix it themselves

neither of these options are *good*, especially if anyone involved is a  mobile user, or not particularly tech savvy in general. 

## idea
discord bots! they're easily accessible, especially with the recent introduction of user-installed apps, which means i can take my tools with me wherever i go, and context menu commands, which means i can run commands in relation to anybody's messages, even if the bot is only installed to me and not the server.

the idea started with the simple concept of automating what i would do to fix these files myself: 
1. download
2. ffmpeg
3. send back.
4. ideally, do not interact with the filesystem

## problem
i don't know how to use ffmpeg in python. i've never used nor heard of what i now know to be "subprocesses" - and wouldn't figure this out for an awfully long time after i originally started this idea. spoiler: i was vastly undereducated about a lot of the relevant concepts necessary here and didn't do a great job of teaching myself.

## solution(s)
### 00 - find libraries
naturally, a few months ago, my first google search was "ffmpeg python". long story short, this led me down several rabbit holes that only left me more confused than i already was, none of the libraries could do what i wanted to do, especially without interacting with the filesystem.

a few more google searches led me to the python library [Pillow](https://pypi.org/project/pillow/), a fork of the Python Imaging Lirary (PIL). This would only help me with images, and stop there in terms of helpfulness, but it's a start.

after a few more hours of banging my head into walls and documentation, i came out with this:

```py
@app_commands.allowed_installs(guilds=True, users=True)
@app_commands.allowed_contexts(guilds=True, dms=True, private_channels=True)
@tree.context_menu(name="fixfiles")
async def fixfiles(interaction: discord.Interaction,  message: discord.Message):
    await interaction.response.defer()
    images = []
    for attachment in message.attachments:
        file = await attachment.read()
        with BytesIO(file) as image_binary:
                    with Image.open(image_binary) as img:
                        img = img.convert("RGBA")
                        with BytesIO() as output_buffer:
                            img.save(output_buffer, format="PNG")
                            output_buffer.seek(0)
                            discord_file = discord.File(fp=output_buffer, filename="converted_image.png")
                            images.append(discord_file)
    await interaction.followup.send(files = images)
```

to be honest? i don't understand all of what this is actually doing. i'm deferring the interaction response, doing some magic to take the images attached to the interacted message and convert them into PNGs, and then send them back. this worked! ...most of the time ... with only images. installing the Pillow AVIF extension gave me a little more reach with the files i could take as input, but it was having some issues with preserving transparency and such, and i was still frustratingly far from the thigns i cared the most about - video and audio.

clearly i need to go back to the drawing board. alas, i was thoroughly lost and didn't even know where to start. until months later, this is where the project stagnated.

### 01 - ffmpegging
in complaining about the fact that i had been stuck on this problem so long, [my best friend](https://github.com/WamWooWam) presented me with some new concepts that would help be a starting point for me to implement this properly, and prompted me to break the problem down into smaller parts:
1. launch ffmpeg
2. feed data to ffmpeg
3. pull data from ffmpeg

all without touching the filesystem. they then also introduced me to some keywords that would massively help me learn what i need to in order to figure this out:
- subprocess
- stdin/stdout
- pipe

after some short research, i figured out that these were all simple concepts. a subprocess allows you to run commands outside of the script, stdin/stdout are the systems in place to input and output from programs (things i'm already familiar with, just given a name and recontextualized), and pipes simply allow you to pass data between programs. i now have the concepts, now to put them together. 

*disclaimer: most of the struggle from this point forward is fighting ffmpeg rather than actually trying to figure out the coding problem*

firstly, i would need to lay out how i want to run this:
```py
for attachment in message.attachments:
    match attachment.content_type.split("/")[0]:
        case "image":
            # process image into readable image
        case "video":
            # process video into readable video
        case "audio":
            # process audio into a video with placeholder
        case _:
            continue

await interaction.followup.send(files = images)
```

by using a switch statement to separate whether the input file is an image, a video, an audio, or a file i can't process, i can write my cases for each of these individual problems without them interfering with each other.

the below snippets were my first big steps towards my goal. an ffmpeg command showing how to pipe the input and output for an ffmpeg command, and python code outlining how to run commands using subprocesses.

`ffmpeg -i -f mp3 pipe: -c:a pcm_s16le -f s16le pipe:`
```py
from subprocess import run, PIPE

p = run(['grep', 'f'], stdout=PIPE, input='one\ntwo\nthree\nfour\nfive\nsix\n', encoding='ascii')
```

after playing with the commands, i discovered that `-f image2` is the option i need to pass in order to get it to output a jpeg file. additionally, i discovered that using `pipe:0` for stdin and `pipe:1` for stdout, instead of implicitly defining them with `pipe:`, i can more effectively ensure that everything is going where i want them to. i realized that gifs are counted as images in discord, and i don't want to convert them, so i made sure i wouldn't run this code if a gif was encountered. lastly, i set the extension to "jpg" so the file has an extension that matches its format.

```py
case "image":
    if attachment.content_type.split("/")[1] == "gif":
        continue
    command = ["ffmpeg", "-i", "pipe:0", "-f", "image2", "pipe:1"]
    extension = "jpg"
```

next up, video. [my girlfriend](https://github.com/char) offered this command to start with for making video work in discord:

`ffmpeg -i $input -c:v h264 -c:a aac -pix_fmt yuv420p -movflags faststart $output.mp4`

after applying this to my pattern and splitting out the command into an array, i got a functional piece of code:

```py
case "video":
    command = ["ffmpeg", "-i", "pipe:0", "-c:v", "h264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "faststart", "-f", "mp4", "pipe:1"]
    extension = "mp4"
```

audio would prove to be deceptively easy after figuring out my video solution. because my goal is to turn audio files into videos with a placeholder visual for the sake of playback on mobile, i could recycle most of the command, adding only a couple options:

```py
case "audio":
    command = ["ffmpeg", "-i", "pipe:0", "-loop", "1", "-r", "10", "-i", "assets/sus.webp", "-shortest", "-c:v", "h264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov+faststart", "-f", "mp4", "pipe:1"]
    extension = "mp4"
```

the addition of the paramters `-loop 1 -r 10 -i assets/sus.webp` inserts a still image as the video channel for the output, particularly at 10 fps defined by `-r`. (note: sus.webp was simply an asset i had readily available)

now, escaping the switch statement, i can start actually processing the files. i've defined, depending on type:
- the command to be run
- the extension to give the file


`discord.Attachment` has a `.read()` method that will output its data as a bytes object. thi is the data that i want to pass into the `input` of `subprocess.run()` for my ffmpeg command. If the command runs successfully (and by proxy has a `.returncode` of 0), then i am taking the data outputted in the process's `stdout` and passing it into a `BytesIO()` object, which can then be passed into a `discord.File()` object. i then append the file to my `images` array (i should probably rename this but oh well) and continue back through the loop for the next attachment.

```py
attachment_data = await attachment.read()
process = run(command, input = attachment_data, stdout = PIPE)
if process.returncode == 0:
    discord_file = discord.File(fp = BytesIO(process.stdout), filename = f"{attachment.filename.split(".")[0]}.{extension}")
    images.append(discord_file)
```

lastly, if at the end of the process there is at least one file in the `images` array, the bot follows up on the deferred interaction with the fixed files, else it simply says there were no files to be fixed.

```py
if len(images) > 0:
    await interaction.followup.send(files = images)
else:
    await interaction.followup.send("No files to fix")
```

there we go! a finished product. this works all well and good, but it can be pushed a little farther.

## optimization (hardware acceleration)
once done, my best friend (wam) proposed the idea of hardware accelerating the ffmpeg commands using the gpu on the server he is graciously allowing me to host my projects on. this has two benefits:
1. significantly faster conversions
2. not completely locking up the cpu (which is running several different projects) while converting

in order to do this, we made slightly different parameter lists depending on whether the expected gpu device is present or not (so it would still work on my machine while testing):
```py
hardware = path.exists("/dev/dri/renderD128")
params = ["-vaapi_device", "/dev/dri/renderD128", "-vf", "hwupload,scale_vaapi=w=-2:h='min(720,iw)':format=nv12", "-c:v", "h264_vaapi", "-b:v", "1M"] if hardware else ["-c:v", "h264", "-vf", "scale=-2:'min(720,iw)'"]
```
*note: wow python's ternary operators are really mickey mouse*

*note2: we also added an option that scales video down to 720p, and leaves it be if it's already smaller than 720p*

additionally, we modified the command arrays to accomodate:
```py
case "video":
    command = ["ffmpeg", "-i", "pipe:0", *params, "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov+faststart", "-f", "mp4", "pipe:1"]
    extension = "mp4"
case "audio":
    command = ["ffmpeg", "-i", "pipe:0", "-loop", "1", "-r", "10", "-i", "assets/sus.webp", "-shortest", *params, "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov+faststart", "-f", "mp4", "pipe:1"]
    extension = "mp4"
```

and now, these conversions run on the gpu, typically fluxuating at ~8x speed!

### guest message from the guy
hi! wam here with a lil info on hardware acceleration

my server is running an intel core i3-3225, a CPU with a whopping 2 cores which... wasn't exactly fast in its day and that day was over 10 years ago. so i knew when aspyn came to me with this idea that i'd need to accelerate video encoding in some way, unfortunately that poses some problems by itself 

intel quicksync video is a finicky beast at the best of times and one thing i've come to understand is it doesn't super enjoy running "headless", as in, without any display attached. as my server exists as a dell tower in an attic with a wifi router plonked on top, this posed some issues for me.

attempting to use the regular `-c:v h264_qsv` returned peculiar intel media sdk errors, given i frankly didn't want to deal with intels bullshit that day, and also noting the fact i may eventually switch to hardware more appropriate (maybe even with a dedicated GPU) i decided to look into VAAPI, the cross-vendor solution for hardware video on linux

naturally, this also didn't work but it was firmly my fault this time. in my stupidity i had installed multiple different VA drivers, and ffmpeg was attempting to use the driver for more modern intel graphics found on later generations of their CPUs, meanwhile i was stuck needing the version that talks to the i965 driver but that was just a case of removing one of the conflicting packages. another issue came when it did start working, it started putting out video averaging 8-10mbps, which is fine in most cases but when we're limited to 10MB file uploads, hardly ideal. this is why there's an additional 1mbps cap in the hardware parameters

## discord sucks actually
so if an attachment doesn't have a file extension, it doesn't have a content type! fun! so im using `python-magic` now

```py
attachment_data = await attachment.read()
mime = magic.from_buffer(attachment_data, mime = True).split("/")
contentType = mime[0]
contentExtension = mime[1]
```
tada extra work to cover discord being stupid yay

## final code

```py
@app_commands.allowed_installs(guilds=True, users=True)
@app_commands.allowed_contexts(guilds=True, dms=True, private_channels=True)
@tree.context_menu(name="fixfiles")
async def fixfiles(interaction: discord.Interaction,  message: discord.Message):
    await interaction.response.defer()
    images = []
    hardware = path.exists("/dev/dri/renderD128")
    params = ["-vaapi_device", "/dev/dri/renderD128", "-vf", "hwupload,scale_vaapi=w=-2:h='min(720,iw)':format=nv12", "-c:v", "h264_vaapi", "-b:v", "1M"] if hardware else ["-c:v", "h264", "-vf", "scale=-2:'min(720,iw)'"]

    for attachment in message.attachments:
        extension = ""
        attachment_data = await attachment.read()
        mime = magic.from_buffer(attachment_data, mime = True).split("/")
        contentType = mime[0]
        contentExtension = mime[1]
        match contentType:
            case "image":
                if contentExtension == "gif":
                    continue
                command = ["ffmpeg", "-i", "pipe:0", "-f", "image2", "pipe:1"]
                extension = "jpg"
            case "video":
                command = ["ffmpeg", "-i", "pipe:0", *params, "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov+faststart", "-f", "mp4", "pipe:1"]
                extension = "mp4"
            case "audio":
                command = ["ffmpeg", "-i", "pipe:0", "-loop", "1", "-r", "10", "-i", "assets/sus.webp", "-shortest", *params, "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov+faststart", "-f", "mp4", "pipe:1"]
                extension = "mp4"
            case _:
                continue

        process = run(command, input = attachment_data, stdout = PIPE)
        if process.returncode == 0:
            discord_file = discord.File(fp = BytesIO(process.stdout), filename = f"{attachment.filename.split(".")[0]}.{extension}")
            images.append(discord_file)
    if len(images) > 0:
        await interaction.followup.send(files = images)
    else:
        await interaction.followup.send("No files to fix")
```

## conclusion
this was an encredibly beneficial project for me, both in terms of my own education and the effect it will have going forward. always having this tool available to me has already proven to be useful. learning the crucial concepts previously outlined (stdi/o, pipes, subprocesses) have heightened my understanding of programs and expanded my ability to envision how to solve problems on my own.