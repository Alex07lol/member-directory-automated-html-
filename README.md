# Member Directory

A small membership management project I made for handling member records and displaying them in a searchable web directory.

The project includes a responsive frontend, authentication system, member management tools, and a Python utility for importing/exporting member data.

## Features

* Search members by name or ID
* Login system with admin access
* Add, edit, and delete members
* Upload member photos
* CSV to JSON conversion (vice-versa //convert.py)

## Files

* `home.html` - Landing page
* `directory.html` - Member directory
* `login.html` - Login page
* `convert.py` - Data conversion and import utility

## Why I Made This

I wanted a simple way to manage member information without having to manually edit JSON files every time something changed.

The Python script helps with importing data from spreadsheets, while the website provides an easier way to browse and manage member records.

#Problems
Now the thing is the convert.py does auto download photos and renames them but it has to be a google drive link (which is public) the reason for this
being it is much easier to collect data as a google form rather than individually (just a personal preferance).

