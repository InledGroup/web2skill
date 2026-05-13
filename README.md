# Web2Skill  
Convert any documentation website into a curated, perfectly converted pack of markdown documents to use as skills for your AI coding agents. All the links between internal pages are replaced with relative links to the markdown files.  
You don't need a skills website, a claude agent crawling a website o a boring shell command or script, you have all you need in a single extension.  

# Functionality  
The extension automatically detects the index component of a website, if the auto-detection don't work, you can select the component with the list of pages and the extension will read it.  
Next, the extension uses turndown to convert the HTML sites to a perfectly converted markdown. All the functionality happens in the extension popup due to limitations of the background task permissions of Chrome.  

# Auditable  
All the code is here. I can't publish to Chrome Web Store yet due to minimal age requirements.  
For trust purposes, a Github Action that can be audited compiles and packs the extension into a Chrome extension format.  

# Install  
You can install the extension unzipping the extension compressed file and uploading to chrome://extensions in developer mode clicking on "Upload uncompressed"  

> [!NOTE]  
> If you find this extension useful, I would be very happy if you left a star.