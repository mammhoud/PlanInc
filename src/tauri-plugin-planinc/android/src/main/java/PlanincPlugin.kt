package com.plugin.planinc

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@InvokeArg
class SetColorArgs {
  lateinit var hex: String
}


@TauriPlugin
class PlanIncPlugin(private val activity: Activity): Plugin(activity) {
    private val implementation = PlanInc()

    @Command
    fun setcolor(invoke: Invoke) {
        val args = invoke.parseArgs(SetColorArgs::class.java)
        implementation.setcolor(args.hex, activity)
        invoke.resolve()
    }

    @Command
    fun openAppSettings(invoke: Invoke) {
        implementation.openAppSettings(activity)
        invoke.resolve()
    }
}
