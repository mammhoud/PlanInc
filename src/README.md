
<img style="border-radius:20px;margin-bottom:20px" src="./app/public/home.png" alt="PlanInc" />

<h1 align="center">PlanInc</h1>

<div align="center">

![Docker Pulls](https://img.shields.io/docker/pulls/mammhoud/planinc?color=ff4444&labelColor=black&logo=docker&logoColor=white&style=flat-square)
![GitHub issues](https://img.shields.io/github/v/release/mammhoud/planinc?color=369eff&labelColor=black&logo=github&style=flat-square)
![Docker Release](https://img.shields.io/docker/v/mammhoud/planinc?color=369eff&label=docker&labelColor=black&logo=docker&logoColor=white&style=flat-square&sort=semver)
![Release Data](https://img.shields.io/github/release-date/mammhoud/planinc?labelColor=black&style=flat-square)
![Release Data]( https://img.shields.io/github/contributors/mammhoud/planinc?color=c4f042&labelColor=black&style=flat-square)
![Release Data](https://img.shields.io/github/forks/mammhoud/planinc?color=8ae8ff&labelColor=black&style=flat-square)
![Release Data]( https://img.shields.io/github/stars/mammhoud/planinc?color=ffcb47&labelColor=black&style=flat-square)
![Release Data]( https://img.shields.io/github/issues/mammhoud/planinc?color=ff80eb&labelColor=black&style=flat-square)
![GitHub license](https://img.shields.io/github/license/mammhoud/planinc?color=white&labelColor=black&logo=github&style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/mammhoud/planinc?color=369eff&labelColor=black&logo=github&style=flat-square)

</div>

<div align="center">

[中文](README.zh-CN.md)
</div>

> Live Demo: username:planinc password:planinc



PlanInc is an AI-powered card note-taking project. Designed for individuals who want to quickly capture and organize their fleeting thoughts. PlanInc allows users to seamlessly jot down ideas the moment they strike, ensuring that no spark of creativity is lost.

<div align="center">

[![Run on PikaPods](./app/public/run-on-pikapods.svg)](https://www.pikapods.com/pods?run=planinc)

</div>

## 🚀Main Features
- 🤖**AI-Enhanced Note Retrieval** ：With PlanInc's advanced AI-powered RAG (Retrieval-Augmented Generation), you can quickly search and access your notes using natural language queries, making it effortless to find exactly what you need.

- 🔒**Data Ownership** :Your privacy matters. All your notes and data are stored securely in your self-hosted environment, ensuring complete control over your information.

- 🚀**Efficient and Fast** :Capture ideas instantly and store them as plain text for easy access, with full Markdown support for quick formatting and seamless sharing.

- 💡**Lightweight architecture with multi-platform support** :Built with Tauri, PlanInc features a clean and lightweight architecture that delivers robust performance while maintaining exceptional speed and efficiency, with native support for multi-platform deployment including macOS, Windows, Android, and Linux.

- 🔓**Open for Collaboration** :As an open-source project, PlanInc invites contributions from the community. All code is transparent and available on GitHub, fostering a spirit of collaboration and constant improvement.

## 📦Start with Docker in seconds

```bash
curl -s https://raw.githubusercontent.com/mammhoud/planinc/main/install.sh | bash
```

## 👨🏼‍💻Contribution
Contributions are the heart of what makes the open-source community so dynamic, creative, and full of learning opportunities. Your involvement helps drive innovation and growth. We deeply value any contribution you make, and we're excited to have you as part of our community. Thank you for your support! 🙌

[![Contributors](https://contrib.rocks/image?repo=mammhoud/planinc)]([...](https://github.com/mammhoud/planinc/graphs/contributors))



## Sponsorship
If you find PlanInc valuable, consider supporting us! Your contribution will enable us to continue enhancing and maintaining the project for everyone. Thank you for helping us grow. If you'd like to deploy PlanInc, you can also use PikaPods to support PlanInc. 20% of the deployment fees generated on PikaPods will be contributed to PlanInc.

[![Run on PikaPods](./app/public/run-on-pikapods.svg)](https://www.pikapods.com/pods?run=planinc)

[https://ko-fi.com/mammhoud](https://ko-fi.com/mammhoud)

[https://afdian.com/a/mammhoud/plan](https://afdian.com/a/mammhoud/plan)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mammhoud/planinc&type=Date)](https://star-history.com/#mammhoud/planinc&Date)

<div align="center">
    <a href="https://next.ossinsight.io/widgets/official/compose-last-28-days-stats?repo_id=877230294" target="_blank" style="display: block" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-last-28-days-stats/thumbnail.png?repo_id=877230294&image_size=auto&color_scheme=dark" width="655" height="auto">
    <img alt="Performance Stats of mammhoud/planinc - Last 28 days" src="https://next.ossinsight.io/widgets/official/compose-last-28-days-stats/thumbnail.png?repo_id=877230294&image_size=auto&color_scheme=light" width="655" height="auto">
  </picture>
    </a>
</div>

<div align="center">
    <a href="https://next.ossinsight.io/widgets/official/analyze-repo-stars-map?repo_id=877230294&activity=stars" target="_blank" style="display: block" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/analyze-repo-stars-map/thumbnail.png?repo_id=877230294&activity=stars&image_size=auto&color_scheme=dark" width="721" height="auto">
    <img alt="Star Geographical Distribution of mammhoud/planinc" src="https://next.ossinsight.io/widgets/official/analyze-repo-stars-map/thumbnail.png?repo_id=877230294&activity=stars&image_size=auto&color_scheme=light" width="721" height="auto">
  </picture>
    </a>
</div>

## FAQ
Q: Why does the MacOS device installation show as damaged?

A: macOS adds an attribute called com.apple.quarantine to apps that are not notarized when downloading or installing them. This command is used to manually remove that attribute. Run sudo xattr -rd com.apple.quarantine /Applications/planinc.app

