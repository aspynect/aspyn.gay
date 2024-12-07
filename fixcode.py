with open("code.html", "r+") as f:
    d = f.readlines()
    f.seek(0)
    for line in d:
        if line.startswith("<span"):
            f.write(line)
    f.truncate()